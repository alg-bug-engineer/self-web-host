"""Independent reference-model audit, not performance or exhaustive proof.

Run without Python -O: assertions are the checks. Synthetic trusted reports only.
No network, model, credentials or nonlocal side effect is used.
"""
import json
from pathlib import Path
import random
import sqlite3
import tempfile
import fanout
from run_experiment import parallel, spec


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def read_database(path):
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute('BEGIN')
        assert not connection.execute('PRAGMA foreign_key_check').fetchall()
        return {table: [dict(row) for row in connection.execute('SELECT * FROM '+table)]
                for table in ('job', 'branch', 'receipt', 'continuation', 'effect')}
    finally:
        connection.close()


def check_snapshot(current, previous=None):
    """Independently derive all-settled state and immutable snapshot, including history."""
    jobs = {row['id']: row for row in current['job']}
    branches = {(row['job_id'], row['id']): row for row in current['branch']}
    continuations = {row['job_id']: row for row in current['continuation']}
    effects = {row['job_id']: row for row in current['effect']}
    receipts = {row['event_id']: row for row in current['receipt']}
    assert len(jobs) == len(current['job'])
    assert len(branches) == len(current['branch'])
    assert len(continuations) == len(current['continuation'])
    assert len(effects) == len(current['effect'])
    for job_id, job in jobs.items():
        group = [row for (owner, _), row in branches.items() if owner == job_id]
        assert 1 <= len(group) <= 32
        assert {row['id']: row['request'] for row in group} == json.loads(job['manifest'])
        assert all(row['value'] == '' for row in group if row['state'] in ('pending', 'unknown'))
        closed = all(row['state'] in ('ok', 'rejected') for row in group)
        expected = ('failed' if any(row['state'] == 'rejected' for row in group) else 'succeeded') if closed else 'open'
        assert job['state'] == expected
        if not closed:
            assert job_id not in continuations and job_id not in effects
        else:
            wanted = canonical([{'id': row['id'], 'state': row['state'], 'value': row['value']}
                                for row in sorted(group, key=lambda row: row['id'])])
            assert continuations[job_id]['snapshot'] == wanted
            assert bool(continuations[job_id]['consumed']) == (job_id in effects)
            if job_id in effects:
                assert effects[job_id]['snapshot'] == wanted
    assert all(owner in jobs for owner, _ in branches)
    assert set(continuations) <= set(jobs) and set(effects) <= set(continuations)
    if previous is not None:
        for old in previous['job']:
            assert jobs[old['id']]['manifest'] == old['manifest']
            if old['state'] != 'open':
                assert jobs[old['id']] == old
        for old in previous['branch']:
            now = branches[old['job_id'], old['id']]
            assert now['request'] == old['request']
            if old['state'] in ('ok', 'rejected'):
                assert now == old
            if old['state'] == 'unknown':
                assert now['state'] != 'pending'
        for old in previous['receipt']:
            assert receipts[old['event_id']] == old
        for old in previous['continuation']:
            now = continuations[old['job_id']]
            assert now['snapshot'] == old['snapshot']
            assert now['consumed'] >= old['consumed']
        for old in previous['effect']:
            assert effects[old['job_id']] == old


class Reference:
    """Plain-Python state machine: never queries the implementation to choose a result."""
    def __init__(self):
        self.jobs = {}
        self.receipts = {}

    def create(self, job_id, manifest):
        if job_id in self.jobs:
            return 'replay' if self.jobs[job_id]['manifest'] == manifest else 'conflict'
        self.jobs[job_id] = {'manifest': dict(manifest), 'branches': {key: ['pending', ''] for key in manifest}, 'consumed': False}
        return 'created'

    def report(self, event_id, job_id, branch_id, outcome, value):
        body = [job_id, branch_id, outcome, value]
        if event_id in self.receipts:
            previous_body, result = self.receipts[event_id]
            return {'delivery': 'replay', 'result': result} if previous_body == body else {'delivery': 'conflict', 'result': 'event_conflict'}
        if job_id not in self.jobs:
            result = 'unknown_job'
        elif branch_id not in self.jobs[job_id]['branches']:
            result = 'unknown_branch'
        else:
            old = self.jobs[job_id]['branches'][branch_id]
            if old[0] in ('ok', 'rejected'):
                result = 'already_terminal' if old == [outcome, value] else 'terminal_conflict'
            else:
                self.jobs[job_id]['branches'][branch_id] = [outcome, value]
                result = 'unresolved' if outcome == 'unknown' else 'recorded'
        self.receipts[event_id] = [body, result]
        return {'delivery': 'new', 'result': result}

    def consume(self, job_id):
        if job_id not in self.jobs or any(outcome[0] in ('pending', 'unknown') for outcome in self.jobs[job_id]['branches'].values()):
            return 'not_ready'
        job = self.jobs[job_id]
        if job['consumed']:
            return 'replay'
        job['consumed'] = True
        return 'consumed'

    def compare(self, view):
        assert len(view['job']) == len(self.jobs)
        for row in view['job']:
            assert json.loads(row['manifest']) == self.jobs[row['id']]['manifest']
        expected_branches = {(job_id, branch_id): state for job_id, job in self.jobs.items() for branch_id, state in job['branches'].items()}
        actual_branches = {(row['job_id'], row['id']): [row['state'], row['value']] for row in view['branch']}
        assert actual_branches == expected_branches
        actual_receipts = {row['event_id']: [json.loads(row['body']), row['result']] for row in view['receipt']}
        assert actual_receipts == self.receipts
        assert {row['job_id'] for row in view['effect']} == {job_id for job_id, job in self.jobs.items() if job['consumed']}


def run_random(root, seeds=40, operations=300):
    exact_replays = 0
    for seed in range(seeds):
        rng = random.Random(seed)
        path = root / ('random-'+str(seed)+'.db')
        fanout.init(path)
        model = Reference()
        previous = read_database(path)
        for index in range(operations):
            job_id = 'job-'+str(rng.randrange(6))
            choice = rng.randrange(10)
            if choice < 2:
                manifest = {str(i): 'query-'+str(i) for i in range(1+rng.randrange(4))}
                if rng.randrange(4) == 0:
                    manifest['0'] = 'changed-query'
                expected = model.create(job_id, manifest)
                actual = fanout.create(path, job_id, manifest)
            elif choice < 8:
                if model.receipts and rng.randrange(5) == 0:
                    event_id = rng.choice(list(model.receipts))
                    body = model.receipts[event_id][0]
                    args = [event_id] + body
                    exact_replays += 1
                else:
                    outcome = rng.choice(['unknown', 'ok', 'rejected'])
                    args = ['event-'+str(rng.randrange(120)), job_id, str(rng.randrange(5)), outcome,
                            '' if outcome == 'unknown' else rng.choice(['', 'answer-A', 'answer-B', '合成结果'])]
                expected = model.report(*args)
                actual = fanout.report(path, *args)
            else:
                expected = model.consume(job_id)
                actual = fanout.consume(path, job_id)
            assert actual == expected, (seed, index, actual, expected)
            current = read_database(path)
            check_snapshot(current, previous)
            model.compare(current)
            previous = current
    return {'seeds': seeds, 'operations_per_seed': operations, 'operations': seeds*operations, 'exact_replay_operations': exact_replays}


def run_contention(root, rounds=30, processes=12):
    for round_number in range(rounds):
        path = root / ('race-'+str(round_number)+'.db')
        fanout.init(path)
        fanout.create(path, 'job', {'branch': 'synthetic query'})
        previous = read_database(path)
        specs = []
        for i in range(processes):
            outcome = ['unknown', 'ok', 'rejected'][i % 3]
            specs.append(spec('report', 'event-'+str(i), 'job', 'branch', outcome,
                              '' if outcome == 'unknown' else 'value-'+outcome))
        results = parallel(path, specs)
        current = read_database(path)
        check_snapshot(current, previous)
        assert len(current['receipt']) == processes
        assert len(current['continuation']) == 1
        assert sum(result['result'] == 'recorded' for result in results) == 1
        assert current['job'][0]['state'] in ('succeeded', 'failed')
        # Exact event retry must preserve its own history, even if it was an earlier unknown.
        for command, original in zip(specs, results):
            repeat = fanout.report(path, *command['args'])
            assert repeat == {'delivery': 'replay', 'result': original['result']}
        assert read_database(path) == current
        assert fanout.consume(path, 'job') == 'consumed'
        consumed = read_database(path)
        check_snapshot(consumed, current)
        assert fanout.consume(path, 'job') == 'replay'
        assert read_database(path) == consumed
    return {'rounds': rounds, 'processes_per_round': processes, 'gated_processes': rounds*processes}


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        random_results = run_random(root)
        contention_results = run_contention(root)
    print(json.dumps({'status': 'pass', 'reference_model': random_results, 'contention': contention_results}, sort_keys=True))

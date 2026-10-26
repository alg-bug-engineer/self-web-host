"""Independent state-machine and concurrent-history audit of the teaching protocol.

Trusted synthetic inputs only. No remote calls, performance claim or exhaustive proof.
Run without Python -O: assertions are the checks. Only temporary databases are used.
"""
import itertools
import json
from pathlib import Path
import random
import selectors
import sqlite3
import subprocess
import sys
import tempfile

import cancellation as implementation


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def read_state(path):
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    try:
        db.execute('BEGIN')
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        return {table: [dict(row) for row in db.execute('SELECT * FROM '+table+' ORDER BY 1,2')]
                for table in ('job', 'step', 'receipt')}
    finally:
        db.close()


class Reference:
    """Plain in-memory specification; chooses outcomes without consulting SQL state."""
    def __init__(self):
        self.jobs = {}
        self.events = {}

    def new_job(self, job_id, requests, admitted):
        self.jobs[job_id] = {'requests': list(requests), 'admitted': admitted,
                             'control': 'run' if admitted else 'acknowledged',
                             'steps': [['pending', ''] for _ in requests]}

    @staticmethod
    def result(job):
        states = [state for state, _ in job['steps']]
        if 'rejected' in states:
            return 'failed'
        return 'succeeded' if all(state == 'ok' for state in states) else 'open'

    def apply(self, command):
        op, *args = command
        if op in ('request_cancel', 'report'):
            event_id = args[0]
            body = (['cancel'] if op == 'request_cancel' else ['report']) + args[1:]
            if event_id in self.events:
                old_body, old_result = self.events[event_id]
                return ({'delivery': 'replay', 'result': old_result} if old_body == body
                        else {'delivery': 'conflict', 'result': 'event_conflict'})
            result = self.cancel(*args[1:]) if op == 'request_cancel' else self.report(*args[1:])
            self.events[event_id] = [body, result]
            return {'delivery': 'new', 'result': result}
        return getattr(self, op)(*args)

    def submit(self, job_id, requests):
        if job_id not in self.jobs:
            self.new_job(job_id, requests, 1)
            return 'created'
        job = self.jobs[job_id]
        if job['requests'] != requests:
            return 'conflict'
        return 'replay' if job['admitted'] else 'blocked_cancelled'

    def cancel(self, job_id, requests):
        if job_id not in self.jobs:
            self.new_job(job_id, requests, 0)
            return 'cancelled_before_submit'
        job = self.jobs[job_id]
        if job['requests'] != requests:
            return 'spec_conflict'
        if job['control'] == 'acknowledged':
            return 'already_acknowledged'
        if job['control'] == 'requested':
            return 'already_requested'
        if self.result(job) != 'open':
            return 'too_late'
        job['control'] = 'requested'
        return 'requested'

    def reserve(self, job_id):
        if job_id not in self.jobs:
            return {'status': 'missing', 'seq': None}
        job = self.jobs[job_id]
        if job['control'] != 'run':
            return {'status': 'cancelled' if job['control'] == 'acknowledged' else 'cancel_requested', 'seq': None}
        if self.result(job) != 'open':
            return {'status': 'terminal', 'seq': None}
        for seq, (state, _) in enumerate(job['steps']):
            if state in ('inflight', 'unknown'):
                return {'status': 'inflight', 'seq': seq}
            if state == 'pending':
                job['steps'][seq] = ['inflight', '']
                return {'status': 'reserved', 'seq': seq}
        raise AssertionError('Open job must have unfinished work')

    def report(self, job_id, seq, outcome, value):
        if job_id not in self.jobs:
            return 'unknown_job'
        job = self.jobs[job_id]
        if seq >= len(job['steps']):
            return 'unknown_step'
        old = job['steps'][seq]
        if old[0] == 'pending':
            return 'not_reserved'
        if old[0] in ('ok', 'rejected'):
            return 'already_settled' if old == [outcome, value] else 'terminal_conflict'
        job['steps'][seq] = [outcome, value]
        return 'unresolved' if outcome == 'unknown' else 'recorded'

    def checkpoint(self, job_id):
        if job_id not in self.jobs:
            return 'missing'
        job = self.jobs[job_id]
        if job['control'] == 'run':
            return 'not_requested'
        if job['control'] == 'acknowledged':
            return 'replay'
        if any(state in ('inflight', 'unknown') for state, _ in job['steps']):
            return 'inflight'
        job['control'] = 'acknowledged'
        return 'acknowledged'

    def snapshot(self):
        return {
            'job': [{'id': key, 'spec': canonical(job['requests']), 'admitted': job['admitted'],
                     'control': job['control'], 'result': self.result(job)}
                    for key, job in sorted(self.jobs.items())],
            'step': [{'job_id': key, 'seq': seq, 'request': job['requests'][seq], 'state': state, 'value': value}
                     for key, job in sorted(self.jobs.items()) for seq, (state, value) in enumerate(job['steps'])],
            'receipt': [{'event_id': key, 'body': canonical(body), 'result': result}
                        for key, (body, result) in sorted(self.events.items())],
        }


def run_command(path, command):
    op, *args = command
    return getattr(implementation, op)(path, *args)


def check_history(previous, current):
    """Check identity, prefix, result and cancellation monotonicity independently."""
    jobs = {row['id']: row for row in current['job']}
    steps = {(row['job_id'], row['seq']): row for row in current['step']}
    events = {row['event_id']: row for row in current['receipt']}
    ranks = {'run': 0, 'requested': 1, 'acknowledged': 2}
    for old in previous['job']:
        new = jobs[old['id']]
        assert (new['spec'], new['admitted']) == (old['spec'], old['admitted'])
        assert ranks[new['control']] >= ranks[old['control']]
        if old['result'] != 'open':
            assert new['result'] == old['result']
        if old['control'] == 'acknowledged':
            assert new == old
    for old in previous['step']:
        new = steps[old['job_id'], old['seq']]
        assert new['request'] == old['request']
        if old['state'] in ('ok', 'rejected'):
            assert new == old
        if old['state'] in ('inflight', 'unknown'):
            assert new['state'] not in ('pending',)
        if old['state'] == 'unknown':
            assert new['state'] != 'inflight'
    for old in previous['receipt']:
        assert events[old['event_id']] == old
    for key, job in jobs.items():
        group = [row for row in current['step'] if row['job_id'] == key]
        assert [row['seq'] for row in group] == list(range(len(group)))
        assert [row['request'] for row in group] == json.loads(job['spec'])
        non_ok = [row for row in group if row['state'] != 'ok']
        assert all(row['state'] == 'pending' for row in non_ok[1:])
        assert all(row['value'] == '' for row in group if row['state'] not in ('ok', 'rejected'))
        active = [row for row in group if row['state'] in ('inflight', 'unknown')]
        assert len(active) <= 1
        if job['control'] == 'acknowledged':
            assert not active
        if not job['admitted']:
            assert job['control'] == 'acknowledged' and all(row['state'] == 'pending' for row in group)


def mixed_operations(root, seeds=48, operations=300):
    replays = 0
    result_counts = {}
    for seed in range(seeds):
        rng = random.Random(seed)
        path = root / ('mixed-'+str(seed)+'.db')
        implementation.init(path)
        model = Reference()
        previous = read_state(path)
        event_commands = []
        for index in range(operations):
            # Grow the job pool to exercise fresh work after earlier cancellations.
            job_id = 'job-'+str(rng.randrange(2+index//20))
            requests = ['合成步骤-'+str(i) for i in range(1+rng.randrange(3))]
            choice = rng.randrange(12)
            if event_commands and rng.randrange(5) == 0:
                command = rng.choice(event_commands)
                replays += 1
            elif choice < 3:
                command = ['submit', job_id, requests]
            elif choice < 5:
                command = ['reserve', job_id]
            elif choice < 9:
                job = model.jobs.get(job_id)
                active = [i for i, (state, _) in enumerate(job['steps']) if state in ('inflight', 'unknown')] if job else []
                seq = active[0] if active and rng.randrange(4) else rng.randrange(4)
                outcome = rng.choice(['unknown', 'ok', 'ok', 'rejected'])
                command = ['report', 'event-'+str(rng.randrange(150)), job_id, seq, outcome,
                           '' if outcome == 'unknown' else rng.choice(['', 'result-A', 'result-B', '合成'])]
            elif choice == 9:
                job = model.jobs.get(job_id)
                if job and rng.randrange(4):
                    requests = job['requests']
                command = ['request_cancel', 'event-'+str(rng.randrange(150)), job_id, requests]
            else:
                command = ['checkpoint', job_id]
            expected = model.apply(command)
            actual = run_command(path, command)
            assert actual == expected, (seed, index, command, actual, expected)
            key = actual.get('result', actual.get('status')) if isinstance(actual, dict) else actual
            result_counts[key] = result_counts.get(key, 0) + 1
            if command[0] in ('report', 'request_cancel'):
                event_commands.append(command)
            current = read_state(path)
            assert current == model.snapshot(), (seed, index, command)
            check_history(previous, current)
            previous = current
    for required in ['recorded', 'unresolved', 'requested', 'cancelled_before_submit', 'event_conflict',
                     'spec_conflict', 'already_settled', 'terminal_conflict', 'acknowledged', 'too_late']:
        assert result_counts.get(required, 0) > 0, ('missing coverage', required)
    return {'seeds': seeds, 'operations_per_seed': operations, 'operations': seeds*operations,
            'explicit_repeat_attempts': replays, 'result_counts': result_counts}


def parallel(path, commands):
    children = [subprocess.Popen([sys.executable, __file__, '--child', str(path), json.dumps(command)],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                for command in commands]
    try:
        # Readiness timeout is a test-hang guard, not a performance observation.
        with selectors.DefaultSelector() as selector:
            for child in children:
                selector.register(child.stdout, selectors.EVENT_READ)
            while selector.get_map():
                events = selector.select(40)
                if not events:
                    raise TimeoutError('worker READY timeout')
                for key, _ in events:
                    assert key.fileobj.readline().strip() == 'READY'
                    selector.unregister(key.fileobj)
        for child in children:
            child.stdin.write('GO\n')
            child.stdin.flush()
        results = []
        for child in children:
            output, error = child.communicate(timeout=40)
            assert child.returncode == 0, (child.returncode, error)
            results.append(json.loads(output))
        return results
    finally:
        for child in children:
            if child.poll() is None:
                child.kill()
                child.wait()


def concurrent_histories(root, rounds=32):
    """Four overlapping calls: require an exact legal serial history among 24 orders."""
    modes = ['creation', 'last_result', 'unknown_result', 'receipt_identity']
    legal_histories = 0
    for round_number in range(rounds):
        path = root / ('race-'+str(round_number)+'.db')
        implementation.init(path)
        mode = modes[round_number % len(modes)]
        setup = [] if mode == 'creation' else [['submit', 'job', ['synthetic step']], ['reserve', 'job']]
        if mode == 'unknown_result':
            setup.append(['report', 'old-unknown', 'job', 0, 'unknown', ''])
        for command in setup:
            run_command(path, command)
        previous = read_state(path)
        if mode == 'creation':
            commands = [['submit', 'job', ['synthetic step']],
                        ['request_cancel', 'cancel', 'job', ['synthetic step']],
                        ['reserve', 'job'], ['checkpoint', 'job']]
        elif mode == 'receipt_identity':
            commands = [['request_cancel', 'shared-event', 'job', ['synthetic step']],
                        ['report', 'shared-event', 'job', 0, 'ok', 'result'],
                        ['report', 'other-event', 'job', 0, 'unknown', ''], ['checkpoint', 'job']]
        else:
            commands = [['request_cancel', 'cancel', 'job', ['synthetic step']],
                        ['report', 'finish', 'job', 0, 'ok', 'result'],
                        ['reserve', 'job'], ['checkpoint', 'job']]
        actual = parallel(path, commands)
        current = read_state(path)
        check_history(previous, current)
        matches = 0
        for order in itertools.permutations(range(4)):
            model = Reference()
            for command in setup:
                model.apply(command)
            results = [None]*4
            for index in order:
                results[index] = model.apply(commands[index])
            if results == actual and model.snapshot() == current:
                matches += 1
        assert matches > 0, (mode, actual, current)
        legal_histories += matches
        # Historical event returns remain stable after all concurrent calls finish.
        for command, old_result in zip(commands, actual):
            if command[0] not in ('report', 'request_cancel'):
                continue
            result = run_command(path, command)
            expected_delivery = 'conflict' if old_result['delivery'] == 'conflict' else 'replay'
            assert result == {'delivery': expected_delivery, 'result': old_result['result']}
        assert read_state(path) == current
    return {'rounds': rounds, 'processes_per_round': 4, 'gated_processes': rounds*4,
            'candidate_orders_per_round': 24, 'all_histories_match_reference': True}


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--child':
        print('READY', flush=True)
        assert input() == 'GO'
        print(json.dumps(run_command(sys.argv[2], json.loads(sys.argv[3]))), flush=True)
    else:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            random_result = mixed_operations(root)
            concurrent_result = concurrent_histories(root)
        print(json.dumps({'status': 'pass', 'reference_model': random_result,
                          'concurrent_histories': concurrent_result}, sort_keys=True))

"""Deterministic local experiments. Unsafe branches are explicit counterexamples."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
from approval import (base_plan, change, connection, execute, grant, initialize,
                      revoke, snapshot, transaction)

HERE = Path(__file__).resolve().parent


def child(path, mode):
    if mode in {'unsafe_revocation', 'safe_revocation'}:
        if mode == 'unsafe_revocation':
            with connection(path) as c:
                assert c.execute("SELECT state FROM approval WHERE id='grant-1'").fetchone()[0] == 'active'
        print('READY', flush=True)
        assert sys.stdin.readline().strip() == 'GO'
        if mode == 'unsafe_revocation':
            # Deliberately wrong: trusts an earlier approval check after releasing its connection.
            with connection(path) as c, transaction(c):
                c.execute("UPDATE resource SET quota=quota-3,rev=rev+1 WHERE name='A'")
                c.execute("UPDATE resource SET quota=quota+3,rev=rev+1 WHERE name='B'")
                c.execute("INSERT INTO effect VALUES ('job-1','A','B',3)")
            print(json.dumps({'status': 'unsafe_applied'}), flush=True)
        else:
            print(json.dumps(execute(path, 'grant-1', 'job-1', base_plan(), 10)), flush=True)
    else:
        execute(path, 'grant-1', 'job-1', base_plan(), 10, crash=mode)


def crash_run(path, stage):
    return subprocess.run([sys.executable, str(HERE / 'run_experiment.py'), '--child', str(path), stage],
                          capture_output=True, text=True, timeout=15).returncode


def revocation_race(path, mode):
    p = subprocess.Popen([sys.executable, str(HERE / 'run_experiment.py'), '--child', str(path), mode],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(p.stdout, selectors.EVENT_READ)
            if not selector.select(15):
                raise RuntimeError('child did not reach READY')
        if p.stdout.readline().strip() != 'READY':
            raise RuntimeError('unexpected child readiness')
        outcome = revoke(path, 'grant-1')
        stdout, stderr = p.communicate('GO\n', timeout=15)
        if p.returncode != 0:
            raise RuntimeError(stderr)
        return {'revocation': outcome, 'execution': json.loads(stdout), 'state': snapshot(path)}
    finally:
        if p.poll() is None:
            p.kill(); p.communicate()


def run():
    results = {}
    with tempfile.TemporaryDirectory() as folder:
        def fresh(name):
            path = Path(folder) / (name + '.db')
            initialize(path); grant(path, 'grant-1', 'job-1', base_plan(), 20)
            return path
        path = fresh('changed_intent')
        changed = base_plan(); changed['amount'] = 4
        results['changed_intent'] = {'execution': execute(path, 'grant-1', 'job-1', changed, 10), 'state': snapshot(path)}
        path = fresh('operation_binding')
        results['operation_binding'] = {'execution': execute(path, 'grant-1', 'job-2', base_plan(), 10), 'state': snapshot(path)}
        path = fresh('expiration_boundary')
        results['expiration_boundary'] = {'execution': execute(path, 'grant-1', 'job-1', base_plan(), 20), 'state': snapshot(path)}
        path = fresh('replay_after_expiry')
        first = execute(path, 'grant-1', 'job-1', base_plan(), 19)
        results['replay_after_expiry'] = {'first': first, 'revocation': revoke(path, 'grant-1'),
            'retry': execute(path, 'grant-1', 'job-1', base_plan(), 25), 'state': snapshot(path)}
        for mode in ('unsafe_revocation', 'safe_revocation'):
            results[mode] = revocation_race(fresh(mode), mode)
        for stage in ('after_consume', 'before_commit', 'after_commit'):
            path = fresh(stage)
            code = crash_run(path, stage)
            recovered = snapshot(path)
            retry = execute(path, 'grant-1', 'job-1', base_plan(), 11)
            results[stage] = {'exit': code, 'recovered': recovered, 'retry': retry, 'state': snapshot(path)}
        path = fresh('stale_replan')
        change(path, 'B', 2)
        first = execute(path, 'grant-1', 'job-1', base_plan(), 10)
        new = base_plan(); new['expected']['B'] = 2
        changed_same_id = execute(path, 'grant-1', 'job-1', new, 11)
        changed_new_id = execute(path, 'grant-1', 'job-2', new, 11)
        grant(path, 'grant-2', 'job-2', new, 30)
        approved = execute(path, 'grant-2', 'job-2', new, 11)
        results['stale_replan'] = {'first': first, 'same_id': changed_same_id,
            'old_approval_new_id': changed_new_id, 'new_approval': approved, 'state': snapshot(path)}
        path = fresh('concurrent_duplicates')
        with ThreadPoolExecutor(max_workers=8) as pool:
            statuses = list(pool.map(lambda _: execute(path, 'grant-1', 'job-1', base_plan(), 10)['status'], range(16)))
        results['concurrent_duplicates'] = {'statuses': dict(sorted(Counter(statuses).items())), 'state': snapshot(path)}
        path = fresh('unsafe_blanket_approval')
        # Wrong abstraction: a boolean approves any current plan; no grant/digest binding.
        changed = base_plan(); changed['amount'] = 4
        approved = True
        if approved:
            with connection(path) as c, transaction(c):
                c.execute("UPDATE resource SET quota=quota-?,rev=rev+1 WHERE name='A'", (changed['amount'],))
                c.execute("UPDATE resource SET quota=quota+?,rev=rev+1 WHERE name='B'", (changed['amount'],))
                c.execute("INSERT INTO effect VALUES ('job-1','A','B',?)", (changed['amount'],))
        results['unsafe_blanket_approval'] = {'approved_amount': 3, 'executed_amount': 4, 'state': snapshot(path)}
    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--child', nargs=2, metavar=('DB', 'MODE'))
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.child:
        child(*args.child)
    else:
        result = run()
        if args.check:
            expected = json.loads((HERE / 'results.json').read_text())
            if result != expected:
                raise SystemExit('results differ from checked-in fixture')
            print(f'{len(result)} scenarios match results.json')
        elif args.output:
            args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n')
        else:
            print(json.dumps(result, indent=2, sort_keys=True))

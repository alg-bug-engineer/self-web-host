"""Re-execute local process crashes; compare deterministic semantic observations."""
import argparse
import json
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
from durable_budget import db, init, snapshot, tx

SCRIPT = Path(__file__).with_name('durable_budget.py')


def run(root, fault='none'):
    p = subprocess.run([sys.executable, str(SCRIPT), str(root), '--fault', fault],
                       capture_output=True, text=True, timeout=15)
    expected = {'none': 0, 'before_reserve_commit': 71, 'after_reserve_commit': 72,
                'after_sink_commit': 73, 'after_ack_commit': 74}[fault]
    # Exhaustion returns normally before reaching the fault point.
    if p.returncode not in (0, expected):
        raise AssertionError((p.returncode, p.stderr))
    return {'exit': p.returncode, 'reply': json.loads(p.stdout) if p.stdout else None}


def line(p):
    # Timeout is a harness watchdog, not a measured business deadline.
    with selectors.DefaultSelector() as sel:
        sel.register(p.stdout, selectors.EVENT_READ)
        if not sel.select(15):
            raise AssertionError('child handshake timeout')
    value = p.stdout.readline().strip()
    if not value:
        raise AssertionError('child exited before handshake')
    return value


def concurrent(root, workers=8):
    children = []
    try:
        for _ in range(workers):
            p = subprocess.Popen([sys.executable, str(SCRIPT), str(root), '--start-gate',
                                  '--reserve-gate'], stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            children.append(p)
        for p in children:
            assert line(p) == 'READY'
        for p in children:
            p.stdin.write('GO\n')
            p.stdin.flush()
        first = [line(p) for p in children]
        winners = [p for p, value in zip(children, first) if value == 'RESERVED']
        losers = [json.loads(value)['reason'] for value in first if value != 'RESERVED']
        for p in winners:
            p.stdin.write('GO\n')
            p.stdin.flush()
        replies = [json.loads(line(p)) for p in winners]
        for p in children:
            assert p.wait(timeout=15) == 0, p.stderr.read()
        return {'workers': workers, 'reserved': len(winners), 'rejected': len(losers),
                'reasons': sorted(losers), 'effects_returned': sorted(r['effect'] for r in replies)}
    finally:
        for p in children:
            if p.poll() is None:
                p.kill()
            p.wait(timeout=15)
            for stream in (p.stdin, p.stdout, p.stderr):
                stream.close()


def experiment():
    result = {}
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        for name, fault in [('uncommitted_reservation', 'before_reserve_commit'),
                            ('reserved_before_send', 'after_reserve_commit'),
                            ('sink_commit_without_ack', 'after_sink_commit'),
                            ('acknowledged_before_exit', 'after_ack_commit')]:
            root = base / name
            init(root, 2)
            first = run(root, fault)
            before = snapshot(root)
            second = run(root)
            result[name] = {'first': first, 'before_restart': before,
                            'restart': second, 'after_restart': snapshot(root)}
        root = base / 'exhausted'
        init(root, 2)
        exits = [run(root, 'after_reserve_commit')['exit'] for _ in range(3)]
        result['conservative_exhaustion'] = {'exits': exits, 'state': snapshot(root)}
        root = base / 'concurrent'
        init(root, 3)
        result['concurrent_workers'] = {'admission': concurrent(root), 'state': snapshot(root)}
        root = base / 'non_idempotent'
        init(root, 3, safety='non_idempotent')
        run(root, 'after_sink_commit')
        result['non_idempotent_unknown'] = {'restart': run(root), 'state': snapshot(root)}
        # Deliberately INVALID recovery policy, isolated counterexample fixture.
        # It deletes consumed reservations on missing ack; the safe module never does this.
        root = base / 'unsafe_refund'
        init(root, 1)
        for _ in range(3):
            run(root, 'after_sink_commit')
            with db(root / 'sender.db') as c, tx(c):
                c.execute('DELETE FROM reservation')
                c.execute('UPDATE task SET spent=0')
        result['unsafe_refund_counterexample'] = snapshot(root)
    validate(result)
    return result


def validate(r):
    assert r['uncommitted_reservation']['before_restart']['spent'] == 0
    assert r['uncommitted_reservation']['after_restart']['receiver_calls'] == 1
    assert r['reserved_before_send']['before_restart']['spent'] == 1
    assert r['reserved_before_send']['before_restart']['receiver_calls'] == 0
    assert r['reserved_before_send']['after_restart']['spent'] == 2
    assert r['sink_commit_without_ack']['before_restart']['effects'] == 1
    assert r['sink_commit_without_ack']['after_restart']['receiver_calls'] == 2
    assert r['sink_commit_without_ack']['after_restart']['effects'] == 1
    assert r['acknowledged_before_exit']['after_restart']['spent'] == 1
    assert r['acknowledged_before_exit']['after_restart']['receiver_calls'] == 1
    assert r['conservative_exhaustion']['exits'] == [72, 72, 0]
    assert r['conservative_exhaustion']['state']['spent'] == 2
    assert r['conservative_exhaustion']['state']['effects'] == 0
    assert r['concurrent_workers']['admission']['reserved'] == 3
    assert r['concurrent_workers']['admission']['rejected'] == 5
    assert r['concurrent_workers']['state']['receiver_calls'] == 3
    assert r['concurrent_workers']['state']['effects'] == 1
    assert r['non_idempotent_unknown']['restart']['reply']['reason'] == 'unknown_requires_reconciliation'
    assert r['non_idempotent_unknown']['state']['receiver_calls'] == 1
    assert r['unsafe_refund_counterexample']['receiver_calls'] == 3
    assert r['unsafe_refund_counterexample']['cap'] == 1


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--check', action='store_true')
    p.add_argument('--output', type=Path)
    a = p.parse_args()
    actual = experiment()
    if a.check:
        expected = json.loads(Path(__file__).with_name('results.json').read_text())
        assert actual == expected, 'semantic results differ'
    encoded = json.dumps(actual, ensure_ascii=False, indent=2) + '\n'
    if a.output:
        a.output.write_text(encoded)
    print(encoded, end='')

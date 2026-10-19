"""Deterministic mechanism observations, not a performance benchmark."""
import argparse
import json
import multiprocessing as mp
import tempfile
from pathlib import Path
import ordered_events as oe

CTX = mp.get_context('spawn')
CRASHES = [
    ('producer', 'producer_after_state'),
    ('producer', 'producer_before_commit'),
    ('producer', 'producer_after_commit'),
    ('relay', 'receive_before_commit'),
    ('relay', 'receive_after_commit'),
    ('relay', 'relay_before_ack_commit'),
    ('relay', 'relay_after_ack_commit'),
    ('apply', 'apply_after_projection'),
    ('apply', 'apply_before_commit'),
    ('apply', 'apply_after_commit'),
]


def seed(root, flow='A', schema=1):
    for i, kind in enumerate(('reserved', 'confirmed', 'released')):
        assert oe.advance(root, flow+str(i+1), flow, i, kind, schema=schema) == 'committed'
    return [e for e in oe.events(root) if e['flow_id'] == flow]


def child_crash(root, operation, point):
    if operation == 'producer':
        oe.advance(root, 'A1', 'A', 0, 'reserved', fault=point)
    elif operation == 'relay':
        oe.relay(root, fault=point)
    elif operation == 'apply':
        oe.apply_next(root, 'A', fault=point)
    elif operation == 'unsafe':
        oe.unsafe_state_then_event(root)
    else:
        raise ValueError(operation)


def crashed(root, operation, point):
    p = CTX.Process(target=child_crash, args=(str(root), operation, point))
    p.start(); p.join(30)
    if p.is_alive():
        p.terminate(); p.join(); raise TimeoutError('crash worker watchdog')
    expected = 81 if operation == 'unsafe' else 73
    assert p.exitcode == expected, (operation, point, p.exitcode)
    return p.exitcode


def worker(root, operation, argument, gate, queue):
    try:
        gate.wait(timeout=20)
        if operation == 'receive': result = oe.receive(root, argument)
        elif operation == 'apply': result = oe.apply_next(root, 'A')
        elif operation == 'relay': result = oe.relay(root)
        elif operation == 'advance': result = oe.advance(root, argument, 'A', 0, 'reserved')
        else: raise ValueError(operation)
        queue.put(result)
    except BaseException as error:
        queue.put('ERROR:'+repr(error))
        raise


def parallel(root, operation, arguments):
    gate = CTX.Barrier(len(arguments)); queue = CTX.Queue()
    ps = [CTX.Process(target=worker, args=(str(root), operation, arg, gate, queue)) for arg in arguments]
    for p in ps: p.start()
    try:
        answers = [queue.get(timeout=30) for _ in ps]
        for p in ps:
            p.join(30)
            assert p.exitcode == 0, p.exitcode
        return sorted(answers)
    finally:
        for p in ps:
            if p.is_alive(): p.terminate(); p.join()
        queue.close(); queue.join_thread()


def delayed_receive(root, event, ready, resume, queue):
    ready.set()
    if not resume.wait(20): raise TimeoutError('delivery gate watchdog')
    queue.put(oe.receive(root, event))


def ordered_arrival(root):
    stream = seed(root)
    ready = CTX.Event(); resume = CTX.Event(); queue = CTX.Queue()
    p = CTX.Process(target=delayed_receive, args=(str(root), stream[0], ready, resume, queue))
    p.start()
    try:
        assert ready.wait(20)
        oe.receive(root, stream[2])
        after_three = oe.drain(root, 'A')
        resume.set()
        assert queue.get(timeout=30) == 'accepted'
        p.join(30); assert p.exitcode == 0
        after_one = oe.drain(root, 'A')
        oe.receive(root, stream[1])
        after_two = oe.drain(root, 'A')
        return {'after_3': after_three, 'after_1': after_one, 'after_2': after_two,
                'final': oe.snapshot(root)}
    finally:
        resume.set()
        if p.is_alive(): p.terminate(); p.join()
        queue.close(); queue.join_thread()


def experiment():
    results = {}
    def case(name, run):
        with tempfile.TemporaryDirectory() as d:
            oe.init(d)
            results[name] = run(Path(d))

    def dual(root):
        code = crashed(root, 'unsafe', None)
        return {'exit': code, 'relay': oe.relay(root), 'snapshot': oe.snapshot(root)}
    case('unsafe_dual_write', dual)

    def negative(root):
        stream = seed(root)
        return oe.unsafe_arrival_order(root/'unsafe.db', [stream[i] for i in (2,0,1,2)])
    case('unsafe_dedup_without_order', negative)
    case('ordered_process_delivery_3_1_2', ordered_arrival)

    for operation, point in CRASHES:
        def run(root, operation=operation, point=point):
            if operation != 'producer':
                oe.advance(root, 'A1', 'A', 0, 'reserved')
            if operation == 'apply': oe.relay(root)
            code = crashed(root, operation, point)
            before = oe.snapshot(root)
            oe.advance(root, 'A1', 'A', 0, 'reserved')
            oe.relay(root); oe.drain(root, 'A')
            return {'exit': code, 'before_recovery': before, 'after_recovery': oe.snapshot(root)}
        case('crash_'+point, run)

    def receipt_only(root):
        seed(root)
        for e in oe.events(root): oe.relay(root, e['event_id'])
        return oe.snapshot(root)
    case('accepted_is_not_applied', receipt_only)

    def gap(root):
        stream = seed(root); seed(root, 'B')
        oe.receive(root, stream[0]); oe.receive(root, stream[2])
        for e in oe.events(root):
            if e['flow_id'] == 'B': oe.receive(root, e)
        return {'processing': oe.process_all(root), 'snapshot': oe.snapshot(root)}
    case('gap_isolated_by_flow', gap)

    def upgrade(root):
        oe.advance(root, 'A1', 'A', 0, 'reserved')
        oe.advance(root, 'A2', 'A', 1, 'confirmed', schema=2)
        oe.advance(root, 'A3', 'A', 2, 'released', schema=2)
        for e in oe.events(root): oe.relay(root, e['event_id'])
        initial = oe.drain(root, 'A'); blocked = oe.snapshot(root)
        updated = oe.drain(root, 'A', support_v2=True)
        return {'old_handler': initial, 'blocked': blocked, 'new_handler': updated,
                'final': oe.snapshot(root)}
    case('schema_upgrade_replays_original', upgrade)

    def conflicts(root):
        e = seed(root)[0]; oe.receive(root, e)
        changed = dict(e, payload={'amount': 4})
        renamed = dict(e, event_id='other')
        return {'duplicate': oe.receive(root, e), 'changed_body': oe.receive(root, changed),
                'same_sequence_new_id': oe.receive(root, renamed), 'snapshot': oe.snapshot(root)}
    case('identity_and_sequence_conflicts', conflicts)

    def relay_conflict(root):
        oe.advance(root, 'A1', 'A', 0, 'reserved')
        oe.advance(root, 'B1', 'B', 0, 'reserved')
        e = oe.events(root)[0]
        oe.receive(root, dict(e, payload={'amount': 4}))
        defaults = [oe.relay(root) for _ in range(3)]
        before = oe.snapshot(root)
        selected = oe.relay(root, 'B1')
        oe.drain(root, 'B')
        return {'default_relay_results': defaults, 'before_selected_relay': before,
                'selected_B': selected, 'final': oe.snapshot(root)}
    case('default_relay_conflict_can_starve', relay_conflict)

    def simultaneous(root, operation):
        if operation == 'advance':
            arguments = ['A1']*6
        else:
            oe.advance(root, 'A1', 'A', 0, 'reserved')
            e = oe.events(root)[0]
            if operation == 'apply': oe.receive(root, e)
            arguments = [e]*6
        answers = parallel(root, operation, arguments)
        # Relay scheduling may produce accepted/duplicate/idle; no fixed winner/count.
        if operation == 'relay':
            assert set(answers) <= {'accepted', 'duplicate', 'idle'}
            return {'workers': 6, 'all_statuses_allowed': True, 'snapshot': oe.snapshot(root)}
        return {'answers': answers, 'snapshot': oe.snapshot(root)}
    for operation in ('advance', 'receive', 'apply', 'relay'):
        case('concurrent_'+operation, lambda root, op=operation: simultaneous(root, op))
    return results


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--check', action='store_true')
    p.add_argument('--output', type=Path)
    args = p.parse_args()
    results = experiment()
    if args.check:
        expected = json.loads(Path(__file__).with_name('results.json').read_text())
        assert results == expected, 'full observation differs from frozen results.json'
        print(f'{len(results)} scenarios match results.json')
    elif args.output:
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2)+'\n')
        print(f'{len(results)} scenarios written')
    else:
        print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__': main()

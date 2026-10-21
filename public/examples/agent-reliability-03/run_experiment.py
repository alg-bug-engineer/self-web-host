"""Run real local subprocess/SQLite scenarios, emit deterministic semantic results."""
import argparse
import json
from pathlib import Path
import tempfile
from reconciliation import (init_receiver, init_sender, create_operation, receiver_apply,
    snapshot, classify, dispatch_lost_receipt, read_operation, reconcile,
    approve_compensation, connect, mark_unknown, delayed_original_probe)


def run():
    with tempfile.TemporaryDirectory() as tmp:
        receiver, sender = Path(tmp) / 'receiver.db', Path(tmp) / 'sender.db'
        init_receiver(receiver)
        init_sender(sender)
        create_operation(sender, 'order-1', 'create:synthetic-ticket')
        loss = dispatch_lost_receipt(sender, receiver, 'order-1')
        provisional = snapshot(receiver, 'order-1', 'create:synthetic-ticket')
        evidence = snapshot(receiver, 'order-1', 'create:synthetic-ticket', close=True)
        reconcile(sender, 'order-1', evidence, actor='reviewer-demo', expected_version=1,
                  decision='confirmed')
        try:
            reconcile(sender, 'order-1', evidence, actor='stale-reviewer', expected_version=1,
                      decision='confirmed')
        except ValueError:
            stale_rejected = True
        with connect(sender) as db:
            evidence_count = db.execute('SELECT COUNT(*) FROM evidence').fetchone()[0]
        # Controlled ordering: original invocation has not arrived at receiver yet.
        negative, delayed_status = delayed_original_probe(receiver, 'delayed', 'create:late-ticket', unsafe_retry=True)
        assert delayed_status == 'applied'
        late_count = len(snapshot(receiver, 'delayed', 'create:late-ticket')['matches'])
        terminal, blocked_status = delayed_original_probe(receiver, 'blocked', 'create:blocked-ticket', close=True)
        late_rejected = blocked_status == 'closed'
        # Query outcomes use actual receiver rows, not a fixture of verdict strings.
        receiver_apply(receiver, 'duplicate', 'same')
        receiver_apply(receiver, 'duplicate', 'same')
        receiver_apply(receiver, 'mismatch', 'different')
        outcomes = {
            'complete_open_exact': classify(provisional),
            'closed_exact': classify(evidence),
            'duplicate': classify(snapshot(receiver, 'duplicate', 'same', close=True)),
            'payload_mismatch': classify(snapshot(receiver, 'mismatch', 'expected', close=True)),
            'incomplete_negative': classify(snapshot(receiver, 'missing', 'x', complete=False)),
            'non_authoritative_negative': classify(snapshot(receiver, 'missing', 'x', authoritative=False)),
            'complete_open_negative': classify(negative),
            'closed_authoritative_negative': classify(terminal),
        }
        create_operation(sender, 'blocked', 'create:blocked-ticket')
        mark_unknown(sender, 'blocked', 0)
        reconcile(sender, 'blocked', terminal, actor='reviewer-demo', expected_version=1,
                  decision='not_applied')
        approve_compensation(sender, 'order-1', 'compensate-1', evidence['matches'][0]['id'],
                             actor='approver-demo', expected_version=2)
        compensation = dispatch_lost_receipt(sender, receiver, 'compensate-1',
                                            kind='compensation', target=1)
        try:
            dispatch_lost_receipt(sender, receiver, 'compensate-1', kind='compensation', target=1)
        except ValueError:
            retry_rejected = True
        with connect(receiver) as db:
            compensations = db.execute("SELECT COUNT(*) FROM effects WHERE kind='compensation'").fetchone()[0]
        return {
            'schema_version': 1,
            'lost_receipt': loss,
            'query_outcomes': outcomes,
            'human_reconciliation': {'original': read_operation(sender, 'order-1'),
                'stale_decision_rejected': stale_rejected, 'evidence_records_after_stale_attempt': evidence_count,
                'terminal_absence_state': read_operation(sender, 'blocked')['state']},
            'delayed_original': {'empty_lookup_classification': classify(negative),
                'unsafe_retry_effects_after_delayed_arrival': late_count, 'closed_barrier_rejects_late_write': late_rejected},
            'compensation': {**compensation, 'scoped_target_effect': 1,
                'blind_retry_rejected': retry_rejected, 'receiver_compensation_effects': compensations},
        }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', nargs='?', const=str(Path(__file__).with_name('results.json')))
    parser.add_argument('--output')
    args = parser.parse_args()
    result = run()
    encoded = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if args.check and json.loads(Path(args.check).read_text()) != result:
        raise SystemExit('FAIL: experiment results differ from checked artifact')
    if args.output:
        Path(args.output).write_text(encoded)
    print(encoded, end='')

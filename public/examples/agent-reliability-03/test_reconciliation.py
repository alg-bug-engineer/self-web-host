import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from reconciliation import *
from run_experiment import run


class ReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.receiver = Path(self.temp.name) / 'receiver.db'
        self.sender = Path(self.temp.name) / 'sender.db'
        init_receiver(self.receiver)
        init_sender(self.sender)
        create_operation(self.sender, 'op', 'payload')

    def evidence(self, **kwargs):
        return snapshot(self.receiver, 'op', 'payload', **kwargs)

    def applied_unknown(self):
        mark_unknown(self.sender, 'op', 0)
        receiver_apply(self.receiver, 'op', 'payload')
        return self.evidence(close=True)

    def confirm(self, evidence, **kwargs):
        reconcile(self.sender, 'op', evidence, actor='human-demo',
                  expected_version=kwargs.get('version', 1), decision=kwargs.get('decision', 'confirmed'))

    def test_commit_lost_receipt_is_real_subprocess(self):
        result = dispatch_lost_receipt(self.sender, self.receiver, 'op')
        self.assertEqual(result, {'receiver_exit': 23, 'receipt_bytes': 0, 'sender_state': 'unknown'})
        self.assertEqual(len(self.evidence()['matches']), 1)

    def test_unknown_is_durable_after_reopen(self):
        mark_unknown(self.sender, 'op', 0)
        self.assertEqual(read_operation(self.sender, 'op')['state'], 'unknown')

    def test_unknown_before_dispatch_can_have_zero_effects(self):
        mark_unknown(self.sender, 'op', 0)
        self.assertEqual(self.evidence()['matches'], [])
        self.assertEqual(classify(self.evidence()), 'inconclusive')

    def test_non_idempotent_receiver_repeats_effects(self):
        receiver_apply(self.receiver, 'op', 'payload')
        receiver_apply(self.receiver, 'op', 'payload')
        self.assertEqual(classify(self.evidence(close=True)), 'duplicate_matches')

    def test_open_positive_proves_only_existence(self):
        receiver_apply(self.receiver, 'op', 'payload')
        self.assertEqual(classify(self.evidence()), 'exact_match_existence_only')

    def test_closed_positive_is_unique(self):
        receiver_apply(self.receiver, 'op', 'payload')
        self.assertEqual(classify(self.evidence(close=True)), 'unique_exact_match')

    def test_incomplete_positive_cannot_certify_unique(self):
        receiver_apply(self.receiver, 'op', 'payload')
        self.assertEqual(classify(self.evidence(close=True, complete=False)), 'exact_match_existence_only')

    def test_non_authoritative_positive_cannot_certify_unique(self):
        receiver_apply(self.receiver, 'op', 'payload')
        self.assertEqual(classify(self.evidence(close=True, authoritative=False)), 'exact_match_existence_only')

    def test_payload_mismatch(self):
        receiver_apply(self.receiver, 'op', 'wrong')
        self.assertEqual(classify(self.evidence(close=True)), 'payload_mismatch')

    def test_incomplete_closed_absence_is_inconclusive(self):
        self.assertEqual(classify(self.evidence(close=True, complete=False)), 'inconclusive')

    def test_non_authoritative_closed_absence_is_inconclusive(self):
        self.assertEqual(classify(self.evidence(close=True, authoritative=False)), 'inconclusive')

    def test_complete_open_absence_is_inconclusive(self):
        self.assertEqual(classify(self.evidence()), 'inconclusive')

    def test_late_original_after_empty_lookup(self):
        empty = self.evidence()
        receiver_apply(self.receiver, 'op', 'payload')
        self.assertEqual(empty['matches'], [])
        self.assertEqual(len(self.evidence()['matches']), 1)

    def test_closed_absence_blocks_late_original(self):
        self.assertEqual(classify(self.evidence(close=True)), 'terminal_absence')
        with self.assertRaises(ValueError):
            receiver_apply(self.receiver, 'op', 'payload')
        self.assertEqual(self.evidence()['matches'], [])

    def test_closed_positive_blocks_future_duplicate(self):
        self.applied_unknown()
        with self.assertRaises(ValueError):
            receiver_apply(self.receiver, 'op', 'payload')
        self.assertEqual(len(self.evidence()['matches']), 1)

    def test_reconcile_persists_evidence_and_version(self):
        evidence = self.applied_unknown()
        self.confirm(evidence)
        self.assertEqual(read_operation(self.sender, 'op')['version'], 2)
        with connect(self.sender) as db:
            row = db.execute('SELECT actor,snapshot,from_version,to_version FROM evidence').fetchone()
        self.assertEqual(row[0], 'human-demo')
        self.assertEqual(json.loads(row[1]), evidence)
        self.assertEqual(row[2:], (1, 2))

    def test_stale_cas_cannot_overwrite_or_add_evidence(self):
        evidence = self.applied_unknown()
        self.confirm(evidence)
        with self.assertRaises(ValueError):
            self.confirm(evidence)
        with connect(self.sender) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM evidence').fetchone()[0], 1)

    def test_wrong_version_rejected_even_while_unknown(self):
        evidence = self.applied_unknown()
        with self.assertRaises(ValueError):
            self.confirm(evidence, version=0)
        self.assertEqual(read_operation(self.sender, 'op')['state'], 'unknown')

    def test_evidence_insert_failure_rolls_back_state(self):
        evidence = self.applied_unknown()
        with connect(self.sender) as db:
            db.execute("CREATE TRIGGER reject_evidence BEFORE INSERT ON evidence BEGIN SELECT RAISE(ABORT, 'fail'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.confirm(evidence)
        self.assertEqual(read_operation(self.sender, 'op')['state'], 'unknown')
        self.assertEqual(read_operation(self.sender, 'op')['version'], 1)

    def test_evidence_wrong_operation_rejected(self):
        evidence = self.applied_unknown()
        evidence['operation'] = 'different'
        with self.assertRaises(ValueError):
            self.confirm(evidence)

    def test_evidence_wrong_payload_scope_rejected(self):
        evidence = self.applied_unknown()
        evidence['expected_payload'] = evidence['matches'][0]['payload'] = 'different'
        with self.assertRaises(ValueError):
            self.confirm(evidence)

    def test_unsupported_manual_decision_rejected(self):
        evidence = self.applied_unknown()
        with self.assertRaises(ValueError):
            self.confirm(evidence, decision='not_applied')

    def test_review_requires_actor(self):
        evidence = self.applied_unknown()
        with self.assertRaises(ValueError):
            reconcile(self.sender, 'op', evidence, actor='', expected_version=1, decision='confirmed')

    def test_not_applied_requires_terminal_barrier(self):
        mark_unknown(self.sender, 'op', 0)
        with self.assertRaises(ValueError):
            self.confirm(self.evidence(), decision='not_applied')
        self.confirm(self.evidence(close=True), decision='not_applied')
        self.assertEqual(read_operation(self.sender, 'op')['state'], 'not_applied')

    def test_original_unknown_cannot_blind_retry(self):
        dispatch_lost_receipt(self.sender, self.receiver, 'op')
        with self.assertRaises(ValueError):
            dispatch_lost_receipt(self.sender, self.receiver, 'op')
        self.assertEqual(len(self.evidence()['matches']), 1)

    def approved_compensation(self):
        self.confirm(self.applied_unknown())
        approve_compensation(self.sender, 'op', 'undo', 1, actor='approver-demo', expected_version=2)

    def test_compensation_requires_confirmed_target(self):
        with self.assertRaises(ValueError):
            approve_compensation(self.sender, 'op', 'undo', 1, actor='approver-demo', expected_version=2)

    def test_compensation_wrong_target_rejected(self):
        self.approved_compensation()
        with self.assertRaises(ValueError):
            dispatch_lost_receipt(self.sender, self.receiver, 'undo', kind='compensation', target=2)
        self.assertEqual(read_operation(self.sender, 'undo')['state'], 'pending')

    def test_compensation_cannot_change_kind(self):
        self.approved_compensation()
        with self.assertRaises(ValueError):
            dispatch_lost_receipt(self.sender, self.receiver, 'undo')

    def test_unapproved_compensation_rejected(self):
        with self.assertRaises(ValueError):
            dispatch_lost_receipt(self.sender, self.receiver, 'op', kind='compensation', target=1)

    def test_compensation_unknown_and_no_blind_retry(self):
        self.approved_compensation()
        dispatch_lost_receipt(self.sender, self.receiver, 'undo', kind='compensation', target=1)
        with self.assertRaises(ValueError):
            dispatch_lost_receipt(self.sender, self.receiver, 'undo', kind='compensation', target=1)
        self.assertEqual(read_operation(self.sender, 'undo')['state'], 'unknown')
        self.assertEqual(len(snapshot(self.receiver, 'undo', 'compensate-effect:1')['matches']), 1)

    def test_compensation_approval_insert_failure_rolls_back_operation(self):
        self.confirm(self.applied_unknown())
        with connect(self.sender) as db:
            db.execute("CREATE TRIGGER reject_approval BEFORE INSERT ON approvals BEGIN SELECT RAISE(ABORT, 'fail'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            approve_compensation(self.sender, 'op', 'undo', 1, actor='approver-demo', expected_version=2)
        with self.assertRaises(ValueError):
            read_operation(self.sender, 'undo')

    def test_receiver_rejects_missing_compensation_target(self):
        with self.assertRaises(ValueError):
            receiver_apply(self.receiver, 'undo', 'x', kind='compensation', target=999)
        self.assertEqual(snapshot(self.receiver, 'undo', 'x')['matches'], [])

    def test_compensation_approval_rejects_stale_original_version(self):
        self.confirm(self.applied_unknown())
        with self.assertRaises(ValueError):
            approve_compensation(self.sender, 'op', 'undo', 1, actor='approver-demo', expected_version=1)

    def test_compensation_dispatch_rechecks_original_version(self):
        self.approved_compensation()
        with connect(self.sender) as db:
            db.execute("UPDATE operations SET version=version+1 WHERE operation='op'")
        with self.assertRaises(ValueError):
            dispatch_lost_receipt(self.sender, self.receiver, 'undo', kind='compensation', target=1)
        self.assertEqual(read_operation(self.sender, 'undo')['state'], 'pending')

    def test_query_wrong_kind_rejected(self):
        receiver_apply(self.receiver, 'op', 'payload')
        evidence = self.evidence(close=True, expected_kind='compensation', expected_target=1)
        self.assertEqual(classify(evidence), 'action_scope_mismatch')

    def test_query_wrong_compensation_target_rejected(self):
        receiver_apply(self.receiver, 'op', 'payload')
        receiver_apply(self.receiver, 'undo', 'compensate', kind='compensation', target=1)
        evidence = snapshot(self.receiver, 'undo', 'compensate', close=True,
                            expected_kind='compensation', expected_target=2)
        self.assertEqual(classify(evidence), 'action_scope_mismatch')

    def test_delayed_original_with_unsafe_retry_duplicates(self):
        before, status = delayed_original_probe(self.receiver, 'op', 'payload', unsafe_retry=True)
        self.assertEqual(before['matches'], [])
        self.assertEqual(status, 'applied')
        self.assertEqual(len(self.evidence()['matches']), 2)

    def test_semantic_results_match_recorded_artifact(self):
        expected = json.loads(Path(__file__).with_name('results.json').read_text())
        self.assertEqual(run(), expected)


if __name__ == '__main__':
    unittest.main(verbosity=2)

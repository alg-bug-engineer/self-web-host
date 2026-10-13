import json
from pathlib import Path
import tempfile
import unittest
from durable_budget import acknowledge, attempt, db, init, receive, reserve, snapshot, tx
from run_experiment import concurrent, experiment, run


class DurableBudgetTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        init(self.root, 3)

    def tearDown(self):
        self.tmp.cleanup()

    def test_first_dispatch_costs_one(self):
        attempt(self.root)
        self.assertEqual(snapshot(self.root)['spent'], 1)

    def test_ack_stops_new_reservation(self):
        attempt(self.root)
        self.assertEqual(reserve(self.root), (None, 'confirmed'))

    def test_reservation_does_not_prove_send(self):
        reserve(self.root)
        self.assertEqual(snapshot(self.root)['receiver_calls'], 0)

    def test_reopen_preserves_budget(self):
        reserve(self.root)
        init(self.root, 3)
        self.assertEqual(snapshot(self.root)['spent'], 1)

    def test_limit_change_rejected(self):
        with self.assertRaises(ValueError):
            init(self.root, 4)

    def test_payload_change_rejected(self):
        with self.assertRaises(ValueError):
            init(self.root, 3, payload='different')

    def test_safety_change_rejected(self):
        with self.assertRaises(ValueError):
            init(self.root, 3, safety='non_idempotent')

    def test_invalid_limit_rejected(self):
        for cap in [-1, 1.2, True]:
            with self.subTest(cap=cap), self.assertRaises(ValueError):
                init(self.root, cap)

    def test_zero_limit(self):
        root = self.root / 'zero'
        init(root, 0)
        self.assertEqual(reserve(root), (None, 'budget_exhausted'))

    def test_exhaustion_no_refund(self):
        for _ in range(3):
            reserve(self.root)
        self.assertEqual(reserve(self.root), (None, 'budget_exhausted'))
        self.assertEqual(snapshot(self.root)['spent'], 3)

    def test_insert_failure_rolls_back_counter(self):
        with db(self.root / 'sender.db') as c:
            c.execute("CREATE TRIGGER fail BEFORE INSERT ON reservation BEGIN SELECT RAISE(ABORT, 'fixture'); END")
        with self.assertRaises(Exception):
            reserve(self.root)
        self.assertEqual(snapshot(self.root)['spent'], 0)

    def test_real_exit_before_commit_rolls_back(self):
        self.assertEqual(run(self.root, 'before_reserve_commit')['exit'], 71)
        self.assertEqual(snapshot(self.root)['spent'], 0)
        self.assertEqual(snapshot(self.root)['reservations'], [])

    def test_real_exit_after_reserve_consumes(self):
        self.assertEqual(run(self.root, 'after_reserve_commit')['exit'], 72)
        self.assertEqual(snapshot(self.root)['spent'], 1)
        self.assertEqual(snapshot(self.root)['receiver_calls'], 0)

    def test_real_exit_after_effect_leaves_unknown(self):
        run(self.root, 'after_sink_commit')
        state = snapshot(self.root)
        self.assertFalse(state['confirmed'])
        self.assertEqual(state['effects'], 1)
        self.assertEqual(state['reservations'], [{'seq': 1, 'ack': 0}])

    def test_restart_spends_new_reservation_same_intent(self):
        run(self.root, 'after_sink_commit')
        run(self.root)
        state = snapshot(self.root)
        self.assertEqual((state['spent'], state['receiver_calls'], state['effects']), (2, 2, 1))

    def test_real_exit_after_ack_does_not_resend(self):
        run(self.root, 'after_ack_commit')
        run(self.root)
        self.assertEqual(snapshot(self.root)['receiver_calls'], 1)

    def test_concurrent_workers_bounded(self):
        admission = concurrent(self.root)
        self.assertEqual((admission['reserved'], admission['rejected']), (3, 5))
        state = snapshot(self.root)
        self.assertEqual((state['spent'], state['receiver_calls'], state['effects']), (3, 3, 1))

    def test_non_idempotent_unknown_blocks_even_with_budget(self):
        root = self.root / 'nonidempotent'
        init(root, 3, safety='non_idempotent')
        run(root, 'after_sink_commit')
        self.assertEqual(reserve(root), (None, 'unknown_requires_reconciliation'))
        self.assertEqual(snapshot(root)['spent'], 1)

    def test_non_idempotent_unsent_reservation_also_blocks(self):
        root = self.root / 'unsent'
        init(root, 3, safety='non_idempotent')
        run(root, 'after_reserve_commit')
        self.assertEqual(reserve(root), (None, 'unknown_requires_reconciliation'))
        self.assertEqual(snapshot(root)['effects'], 0)

    def test_receiver_payload_conflict(self):
        ticket, _ = reserve(self.root)
        receive(self.root, ticket)
        ticket['payload'] = 'changed'
        with self.assertRaises(ValueError):
            receive(self.root, ticket)
        self.assertEqual(snapshot(self.root)['effects'], 1)
        self.assertEqual(snapshot(self.root)['receiver_calls'], 2)

    def test_confirmation_does_not_revoke_already_reserved_worker(self):
        first, _ = reserve(self.root)
        delayed, _ = reserve(self.root)
        receive(self.root, first)
        acknowledge(self.root, first['seq'])
        self.assertEqual(reserve(self.root), (None, 'confirmed'))
        receive(self.root, delayed)
        acknowledge(self.root, delayed['seq'])
        state = snapshot(self.root)
        self.assertEqual((state['spent'], state['receiver_calls'], state['effects']), (2, 2, 1))

    def test_ack_unknown_reservation_rejected(self):
        with self.assertRaises(ValueError):
            acknowledge(self.root, 999)
        self.assertFalse(snapshot(self.root)['confirmed'])

    def test_ledger_and_counter_agree(self):
        for _ in range(3):
            reserve(self.root)
        state = snapshot(self.root)
        self.assertEqual(state['spent'], len(state['reservations']))
        self.assertEqual([r['seq'] for r in state['reservations']], [1, 2, 3])

    def test_recorded_scenarios(self):
        expected = json.loads(Path(__file__).with_name('results.json').read_text())
        self.assertEqual(experiment(), expected)


if __name__ == '__main__':
    unittest.main(verbosity=2)

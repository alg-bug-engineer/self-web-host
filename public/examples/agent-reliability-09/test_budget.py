import tempfile
import unittest
from pathlib import Path
import budget as b
from run_experiment import reserve, claim, die, race, ARGS

class LedgerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.p = str(Path(self.temp.name)/'budget.db'); b.init(self.p, 100)
    def tearDown(self): self.temp.cleanup()
    def used(self): return b.snapshot(self.p)['exposure_cents']
    def test_atomic_concurrent_admission(self):
        self.assertEqual(race(self.p), {'budget_exceeded': 5, 'reserved': 3})
        self.assertEqual(self.used(), 90)
    def test_exact_cap(self): self.assertEqual(reserve(self.p, maximum=100), 'reserved')
    def test_over_cap(self): self.assertEqual(reserve(self.p, maximum=101), 'budget_exceeded')
    def test_restart_preserves(self):
        reserve(self.p); b.init(self.p, 100); self.assertEqual(self.used(), 60)
    def test_reinit_cannot_refill(self):
        with self.assertRaises(ValueError): b.init(self.p, 200)
    def test_same_reservation_is_idempotent(self):
        reserve(self.p); self.assertEqual(reserve(self.p), 'existing'); self.assertEqual(self.used(), 60)
    def test_different_bound_conflict(self):
        reserve(self.p); self.assertEqual(reserve(self.p, maximum=30), 'conflict')
    def test_different_quote_conflict(self):
        reserve(self.p)
        self.assertEqual(b.reserve(self.p,'a','demo.search',ARGS,60,'fixed-v2'),'conflict')
    def test_different_tool_claim_rejected(self):
        reserve(self.p); self.assertIsNone(b.claim(self.p,'a','other',ARGS,60,'fixed-v1'))
    def test_different_args_claim_rejected(self):
        reserve(self.p); self.assertIsNone(b.claim(self.p,'a','demo.search',{'query':'new'},60,'fixed-v1'))
    def test_claim_once(self):
        reserve(self.p); self.assertIsNotNone(claim(self.p)); self.assertIsNone(claim(self.p))
    def test_missing_claim(self): self.assertIsNone(claim(self.p))
    def test_unknown_blocks_retry(self):
        reserve(self.p); claim(self.p); self.assertEqual(reserve(self.p,'retry'),'budget_exceeded')
    def test_final_charge_releases_only_difference(self):
        reserve(self.p); claim(self.p); b.reconcile(self.p,'a',20,'bill')
        self.assertEqual(self.used(),20); self.assertEqual(reserve(self.p,'b',80),'reserved')
    def test_final_zero(self):
        reserve(self.p); claim(self.p); b.reconcile(self.p,'a',0,'bill'); self.assertEqual(self.used(),0)
    def test_receipt_idempotent(self):
        reserve(self.p); claim(self.p); b.reconcile(self.p,'a',20,'bill')
        self.assertEqual(b.reconcile(self.p,'a',20,'bill'),'replayed')
    def test_receipt_changes_rejected(self):
        reserve(self.p); claim(self.p); b.reconcile(self.p,'a',20,'bill')
        self.assertEqual(b.reconcile(self.p,'a',30,'bill'),'conflict')
        self.assertEqual(b.reconcile(self.p,'a',20,'other'),'conflict')
    def test_receipt_reuse_rejected(self):
        reserve(self.p,'a',40); claim(self.p,'a',40); reserve(self.p,'b',40); claim(self.p,'b',40)
        b.reconcile(self.p,'a',20,'bill')
        self.assertEqual(b.reconcile(self.p,'b',20,'bill'),'evidence_conflict'); self.assertEqual(self.used(),60)
    def test_not_dispatched_cannot_refund(self):
        reserve(self.p); self.assertEqual(b.reconcile(self.p,'a',0,'bill'),'not_dispatched')
    def test_missing_reconciliation(self): self.assertEqual(b.reconcile(self.p,'none',0,'bill'),'missing')
    def test_overcharge_truth_and_freeze(self):
        reserve(self.p); claim(self.p)
        self.assertEqual(b.reconcile(self.p,'a',120,'bill'),'bound_breached')
        self.assertEqual(self.used(),120); self.assertEqual(reserve(self.p,'b',1),'frozen')
        self.assertEqual(b.snapshot(self.p)['remaining_cents'],-20)
    def test_freeze_blocks_previously_reserved_claim(self):
        reserve(self.p,'a',50); claim(self.p,'a',50); reserve(self.p,'b',50)
        b.reconcile(self.p,'a',60,'bill'); self.assertIsNone(claim(self.p,'b',50))
    def test_freeze_still_accepts_outstanding_bill(self):
        reserve(self.p,'a',50); claim(self.p,'a',50); reserve(self.p,'b',50); claim(self.p,'b',50)
        b.reconcile(self.p,'a',60,'bill-a')
        self.assertEqual(b.reconcile(self.p,'b',40,'bill-b'),'settled'); self.assertEqual(self.used(),100)
        self.assertTrue(b.snapshot(self.p)['frozen'])
    def test_no_float_bool_negative_maximum(self):
        for x in [True, 1.5, -1, 0, None, '60', 10**12+1]:
            with self.subTest(x=x), self.assertRaises(ValueError): reserve(self.p,maximum=x)
    def test_invalid_charge(self):
        reserve(self.p); claim(self.p)
        for x in [True, 1.5, -1, None, '0', 10**12+1]:
            with self.subTest(x=x), self.assertRaises(ValueError): b.reconcile(self.p,'a',x,'bill')
        self.assertEqual(self.used(),60)
    def test_strict_args(self):
        for args in [[], {'x':1}, {1:'x'}]:
            with self.assertRaises(ValueError): b.intent('tool', args, 10, 'v1')
    def test_sorted_args(self):
        self.assertEqual(b.intent('t',{'a':'1','b':'2'},10,'v'),b.intent('t',{'b':'2','a':'1'},10,'v'))
    def test_snapshot_arguments_detached(self):
        reserve(self.p); result=claim(self.p); result['args']['query']='changed'
        self.assertEqual(reserve(self.p),'existing')
    def test_crash_reserve_before_commit(self):
        die(self.p,'reserve_before_commit'); self.assertEqual(self.used(),0)
    def test_crash_reserve_after_commit(self):
        die(self.p,'reserve_after_commit'); self.assertEqual(self.used(),60)
    def test_crash_claim_before_commit(self):
        reserve(self.p); die(self.p,'claim_before_commit'); self.assertIsNotNone(claim(self.p))
    def test_crash_claim_after_commit(self):
        reserve(self.p); die(self.p,'claim_after_commit'); self.assertIsNone(claim(self.p)); self.assertEqual(self.used(),60)
    def test_crash_settle_before_commit(self):
        reserve(self.p); claim(self.p); die(self.p,'settle_before_commit'); self.assertEqual(self.used(),60)
    def test_crash_settle_after_commit(self):
        reserve(self.p); claim(self.p); die(self.p,'settle_after_commit'); self.assertEqual(self.used(),20)
        self.assertEqual(b.reconcile(self.p,'a',20,'invoice-a'),'replayed')

if __name__ == '__main__': unittest.main()

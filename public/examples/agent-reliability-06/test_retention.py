import concurrent.futures
from pathlib import Path
import sqlite3
import tempfile
import unittest
from retention import init, execute, expire_results, close_and_collect, snapshot, connection, transaction
from run_experiment import child, late, unsafe_delete, experiment

class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.p=Path(self.tmp.name)/'test.db';init(self.p)
    def tearDown(self):self.tmp.cleanup()
    def test_same_key(self):
        self.assertEqual(execute(self.p,1,'a')['status'],'created')
        self.assertEqual(execute(self.p,1,'a'),{'status':'replayed','effect':1})
    def test_payload_conflict(self):
        execute(self.p,1,'a');self.assertEqual(execute(self.p,1,'a','different')['status'],'conflict')
        self.assertEqual(snapshot(self.p)['effects'],1)
    def test_tombstone(self):
        execute(self.p,1,'a');expire_results(self.p,1)
        self.assertEqual(execute(self.p,1,'a'),{'status':'result_expired','effect':None})
    def test_tombstone_conflict(self):
        execute(self.p,1,'a');expire_results(self.p,1)
        self.assertEqual(execute(self.p,1,'a','changed')['status'],'conflict')
    def test_close_rejects_known(self):
        execute(self.p,1,'a');close_and_collect(self.p,1)
        self.assertEqual(execute(self.p,1,'a')['status'],'closed')
    def test_close_rejects_unseen(self):
        close_and_collect(self.p,3)
        for epoch in [1,2,3]:self.assertEqual(execute(self.p,epoch,'unseen')['status'],'closed')
    def test_new_epoch(self):
        close_and_collect(self.p,3);self.assertEqual(execute(self.p,4,'a')['status'],'created')
    def test_monotone(self):
        close_and_collect(self.p,3)
        with self.assertRaises(ValueError):close_and_collect(self.p,2)
        self.assertEqual(snapshot(self.p)['boundaries'],[['demo',3]])
    def test_equal_boundary(self):
        close_and_collect(self.p,3);close_and_collect(self.p,3)
        self.assertEqual(snapshot(self.p)['boundaries'],[['demo',3]])
    def test_invalid_epoch(self):
        for v in [0,-1,True,1.5,'1']:
            with self.assertRaises(ValueError):execute(self.p,v,'a')
    def test_invalid_close(self):
        for v in [0,-1,True,1.5,'1']:
            with self.assertRaises(ValueError):close_and_collect(self.p,v)
    def test_invalid_operation(self):
        for v in ['',None,5]:
            with self.assertRaises(ValueError):execute(self.p,1,v)
    def test_invalid_body(self):
        with self.assertRaises(ValueError):execute(self.p,1,'a',{})
    def test_unknown_namespace(self):
        self.assertEqual(execute(self.p,1,'a',namespace='missing')['status'],'unknown_namespace')
        with self.assertRaises(ValueError):close_and_collect(self.p,1,namespace='missing')
    def test_scope_isolation(self):
        init(self.p,'other');close_and_collect(self.p,1)
        self.assertEqual(execute(self.p,1,'a',namespace='other')['status'],'created')
    def test_future_receipt_survives(self):
        execute(self.p,1,'a');execute(self.p,2,'a');close_and_collect(self.p,1)
        self.assertEqual(snapshot(self.p)['receipts'],1)
        self.assertEqual(execute(self.p,2,'a')['status'],'replayed')
    def test_gc_keeps_business_data(self):
        execute(self.p,1,'a');close_and_collect(self.p,1)
        self.assertEqual(snapshot(self.p)['effects'],1)
    def test_same_op_new_epoch_duplicates_business(self):
        execute(self.p,1,'a');close_and_collect(self.p,1);execute(self.p,2,'a')
        self.assertEqual(snapshot(self.p)['effects'],2)
    def test_naive_late_replay(self):
        execute(self.p,1,'work-1');self.assertEqual(late(self.p,lambda:unsafe_delete(self.p))['status'],'created')
        self.assertEqual(snapshot(self.p)['effects'],2)
    def test_sealed_late_replay(self):
        execute(self.p,1,'work-1');self.assertEqual(late(self.p,lambda:close_and_collect(self.p,1))['status'],'closed')
    def test_uncommitted_effect_rolls_back(self):
        child(self.p,fault='before_receipt');self.assertEqual(snapshot(self.p)['effects'],0)
        self.assertEqual(execute(self.p,1,'work-1')['status'],'created')
    def test_committed_effect_without_reply(self):
        child(self.p,fault='after_effect_commit');self.assertEqual(execute(self.p,1,'work-1')['status'],'replayed')
    def test_boundary_crash_rollback(self):
        execute(self.p,1,'a');child(self.p,'close','after_boundary')
        self.assertEqual(snapshot(self.p)['boundaries'],[['demo',0]])
        self.assertEqual(snapshot(self.p)['receipts'],1)
    def test_gc_crash_rollback(self):
        execute(self.p,1,'a');child(self.p,'close','before_close_commit')
        self.assertEqual(snapshot(self.p)['boundaries'],[['demo',0]])
        self.assertEqual(snapshot(self.p)['receipts'],1)
    def test_close_commit_without_reply(self):
        execute(self.p,1,'a');child(self.p,'close','after_close_commit')
        self.assertEqual(snapshot(self.p)['receipts'],0)
        self.assertEqual(execute(self.p,1,'a')['status'],'closed')
    def test_receipt_failure_rolls_back_effect(self):
        with connection(self.p) as c:
            c.execute("CREATE TRIGGER fail BEFORE INSERT ON receipt BEGIN SELECT RAISE(ABORT,'fixture'); END")
        with self.assertRaises(sqlite3.IntegrityError):execute(self.p,1,'a')
        self.assertEqual(snapshot(self.p)['effects'],0)
    def test_gc_failure_rolls_back_boundary(self):
        execute(self.p,1,'a')
        with connection(self.p) as c:
            c.execute("CREATE TRIGGER fail BEFORE DELETE ON receipt BEGIN SELECT RAISE(ABORT,'fixture'); END")
        with self.assertRaises(sqlite3.IntegrityError):close_and_collect(self.p,1)
        self.assertEqual(snapshot(self.p)['boundaries'],[['demo',0]])
        self.assertEqual(snapshot(self.p)['receipts'],1)
    def test_threads_same_key(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            statuses=list(ex.map(lambda _:execute(self.p,1,'a')['status'],range(16)))
        self.assertEqual(statuses.count('created'),1)
        self.assertEqual(statuses.count('replayed'),15)
    def test_reinit_preserves_boundary(self):
        close_and_collect(self.p,3);init(self.p)
        self.assertEqual(snapshot(self.p)['boundaries'],[['demo',3]])
    def test_all_experiments(self):self.assertEqual(len(experiment()),10)

if __name__=='__main__':unittest.main(verbosity=2)

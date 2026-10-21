import copy
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sqlite3
import tempfile
import unittest
from preconditions import init,plan,execute,change,snapshot,connect,validate
from run_experiment import child,finish

class PreconditionsTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.path=Path(self.temp.name)/'test.db';init(self.path);self.cmd=plan(self.path)
    def result(self,op='job-1',cmd=None):
        return execute(self.path,op,self.cmd if cmd is None else cmd)
    def test_applied(self):
        self.assertEqual(self.result()['result']['status'],'applied')
        s=snapshot(self.path);self.assertEqual(s['resources']['A'],{'quota':7,'revision':2});self.assertEqual(s['resources']['B'],{'quota':3,'revision':2})
    def test_replay_precedes_revision_check(self):
        a=self.result();b=self.result();self.assertEqual(b,{'status':'replayed','result':a['result']});self.assertEqual(snapshot(self.path)['effects'],1)
    def test_same_id_changed_amount(self):
        self.result();c=copy.deepcopy(self.cmd);c['amount']=2;self.assertEqual(self.result(cmd=c),{'status':'conflict'})
    def test_same_id_changed_expected(self):
        self.result();self.assertEqual(self.result(cmd=plan(self.path)),{'status':'conflict'})
    def test_source_stale(self):
        change(self.path,'A',1);self.assertEqual(self.result()['result']['status'],'stale');self.assertEqual(snapshot(self.path)['effects'],0)
    def test_destination_stale(self):
        change(self.path,'B',1);self.assertEqual(self.result()['result']['status'],'stale')
    def test_aba(self):
        change(self.path,'A',-1);change(self.path,'A',1);self.assertEqual(snapshot(self.path)['resources']['A']['quota'],10);self.assertEqual(self.result()['result']['status'],'stale')
    def test_terminal_rejection_replayed(self):
        change(self.path,'B',1);a=self.result();change(self.path,'B',1);self.assertEqual(self.result(),{'status':'replayed','result':a['result']})
    def test_replan_new_id(self):
        change(self.path,'B',1);self.result();self.assertEqual(self.result('job-2',plan(self.path))['result']['status'],'applied')
    def test_insufficient(self):
        c=plan(self.path,amount=11);self.assertEqual(self.result(cmd=c)['result']['status'],'insufficient');self.assertEqual(snapshot(self.path)['effects'],0)
    def test_missing_resource(self):
        with connect(self.path) as c:c.execute("DELETE FROM resource WHERE name='B'")
        self.assertEqual(self.result()['result']['status'],'missing_resource')
    def test_untracked_changes_allowed(self):
        change(self.path,'C',1);self.assertEqual(self.result()['result']['status'],'applied')
    def test_init_preserves_state(self):
        self.result();a=snapshot(self.path);init(self.path);self.assertEqual(snapshot(self.path),a)
    def test_bool_amount_rejected(self):
        c=copy.deepcopy(self.cmd);c['amount']=True
        with self.assertRaises(ValueError):self.result(cmd=c)
    def test_zero_amount_rejected(self):
        c=copy.deepcopy(self.cmd);c['amount']=0
        with self.assertRaises(ValueError):self.result(cmd=c)
    def test_missing_dependency_rejected(self):
        c=copy.deepcopy(self.cmd);del c['expected']['B']
        with self.assertRaises(ValueError):self.result(cmd=c)
    def test_extra_field_rejected(self):
        c=copy.deepcopy(self.cmd);c['extra']=1
        with self.assertRaises(ValueError):self.result(cmd=c)
    def test_bool_revision_rejected(self):
        c=copy.deepcopy(self.cmd);c['expected']['A']=True
        with self.assertRaises(ValueError):self.result(cmd=c)
    def test_self_transfer_rejected(self):
        c=copy.deepcopy(self.cmd);c['dst']='A'
        with self.assertRaises(ValueError):self.result(cmd=c)
    def test_empty_op_rejected(self):
        with self.assertRaises(ValueError):self.result('')
    def test_key_order_does_not_change_digest(self):
        c={k:self.cmd[k] for k in reversed(self.cmd)};self.assertEqual(validate(c),validate(self.cmd))
    def test_revision_exhaustion(self):
        with connect(self.path) as c:c.execute("UPDATE resource SET revision=? WHERE name='A'",(2**63-1,))
        self.assertEqual(self.result(cmd=plan(self.path))['result']['status'],'revision_exhausted')
    def test_fixture_change_overflow_rejected(self):
        with self.assertRaises(ValueError):change(self.path,'A',2**63-1)
        self.assertEqual(snapshot(self.path)['resources']['A']['quota'],10)
    def test_quota_exhaustion(self):
        with connect(self.path) as c:c.execute("UPDATE resource SET quota=? WHERE name='B'",(2**63-1,))
        self.assertEqual(self.result()['result']['status'],'quota_exhausted')
    def test_destination_failure_rolls_back_source(self):
        with connect(self.path) as c:c.execute("CREATE TRIGGER no_destination BEFORE UPDATE ON resource WHEN old.name='B' BEGIN SELECT RAISE(ABORT,'injected'); END")
        before=snapshot(self.path)
        with self.assertRaises(sqlite3.IntegrityError):self.result()
        self.assertEqual(snapshot(self.path),before)
    def test_receipt_failure_rolls_back_everything(self):
        with connect(self.path) as c:c.execute("CREATE TRIGGER no_receipt BEFORE INSERT ON receipt BEGIN SELECT RAISE(ABORT,'injected'); END")
        before=snapshot(self.path)
        with self.assertRaises(sqlite3.IntegrityError):self.result()
        self.assertEqual(snapshot(self.path),before)
    def crash_check(self,fault,code,committed):
        self.assertEqual(finish(child(self.path,self.cmd,fault)),{'exit':code,'reply':None})
        s=snapshot(self.path);self.assertEqual(s['effects'],int(committed));self.assertEqual(s['receipts'],int(committed));self.assertEqual(s['resources']['A']['quota'],7 if committed else 10)
        self.assertEqual(self.result()['status'],'replayed' if committed else 'completed');self.assertEqual(snapshot(self.path)['effects'],1)
    def test_crash_after_source(self):self.crash_check('after_source',71,False)
    def test_crash_before_commit(self):self.crash_check('before_commit',72,False)
    def test_crash_after_commit(self):self.crash_check('after_commit',73,True)
    def test_concurrent_distinct_ids(self):
        with ThreadPoolExecutor(max_workers=8) as pool:replies=list(pool.map(lambda i:self.result('job-'+str(i)),range(16)))
        statuses=[r['result']['status'] for r in replies];self.assertEqual(statuses.count('applied'),1);self.assertEqual(statuses.count('stale'),15);self.assertEqual(snapshot(self.path)['effects'],1)
    def test_concurrent_same_id(self):
        with ThreadPoolExecutor(max_workers=8) as pool:replies=list(pool.map(lambda _:self.result(),range(16)))
        self.assertEqual(sum(r['status']=='completed' for r in replies),1);self.assertEqual(sum(r['status']=='replayed' for r in replies),15);self.assertEqual(snapshot(self.path)['effects'],1)

if __name__=='__main__':unittest.main(verbosity=2)

import tempfile
from pathlib import Path
import unittest
from leases import acquire,complete,init,renew,snapshot,write
from run_experiment import run

class Leases(unittest.TestCase):
    def setUp(self):
        self.d=tempfile.TemporaryDirectory();self.p=str(Path(self.d.name)/'x.db');init(self.p)
    def tearDown(self): self.d.cleanup()
    def test_live_lease_excludes_other(self):
        self.assertEqual(acquire(self.p,'r','A',0),1);self.assertIsNone(acquire(self.p,'r','B',9))
    def test_exact_deadline_allows_takeover(self):
        acquire(self.p,'r','A',0);self.assertEqual(acquire(self.p,'r','B',10),2)
    def test_old_owner_cannot_complete(self):
        acquire(self.p,'r','A',0);acquire(self.p,'r','B',10);self.assertFalse(complete(self.p,'r','A',1,11,'old'))
    def test_same_owner_needs_new_epoch(self):
        acquire(self.p,'r','A',0);acquire(self.p,'r','A',10);self.assertFalse(complete(self.p,'r','A',1,11,'old'));self.assertTrue(complete(self.p,'r','A',2,11,'new'))
    def test_expired_completion_rejected_without_takeover(self):
        acquire(self.p,'r','A',0);self.assertFalse(complete(self.p,'r','A',1,10,'x'))
    def test_renew_before_deadline(self):
        acquire(self.p,'r','A',0);self.assertTrue(renew(self.p,'r','A',1,9));self.assertIsNone(acquire(self.p,'r','B',10))
    def test_renew_at_deadline_rejected(self):
        acquire(self.p,'r','A',0);self.assertFalse(renew(self.p,'r','A',1,10))
    def test_renew_after_takeover_rejected(self):
        acquire(self.p,'r','A',0);acquire(self.p,'r','B',10);self.assertFalse(renew(self.p,'r','A',1,11))
    def test_receiver_stale(self):
        write(self.p,'r',2,'new');self.assertEqual(write(self.p,'r',1,'old'),'stale')
    def test_same_epoch_replay(self):
        write(self.p,'r',2,'new');self.assertEqual(write(self.p,'r',2,'new'),'replay')
    def test_same_epoch_conflict(self):
        write(self.p,'r',2,'new');self.assertEqual(write(self.p,'r',2,'changed'),'conflict');self.assertEqual(snapshot(self.p)['sink'][0]['value'],'new')
    def test_resource_epochs_separate(self):
        write(self.p,'r',99,'x');self.assertEqual(write(self.p,'s',1,'y'),'written')
    def test_rollback_includes_fence(self):
        write(self.p,'r',1,'old')
        with self.assertRaises(RuntimeError):write(self.p,'r',2,'new',fail=True)
        self.assertEqual(snapshot(self.p)['sink'][0],{'resource':'r','epoch':1,'value':'old'})
    def test_missing_database_not_recreated(self):
        with self.assertRaises(Exception): acquire(str(Path(self.d.name)/'missing.db'),'r','A',0)
        self.assertFalse((Path(self.d.name)/'missing.db').exists())
    def test_invalid_ttl(self):
        with self.assertRaises(ValueError): acquire(self.p,'r','A',0,0)
    def test_boolean_epoch_rejected(self):
        with self.assertRaises(ValueError):write(self.p,'r',True,'x')
    def test_full_process_experiment(self): self.assertEqual(len(run()['scenarios']),3)

if __name__=='__main__': unittest.main()

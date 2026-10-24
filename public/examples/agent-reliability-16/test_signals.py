import tempfile
import unittest
from pathlib import Path
import signals as s


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.p=Path(self.tmp.name)/'db'; s.init(self.p)
    def tearDown(self): self.tmp.cleanup()
    def open(self,deadline=10): return s.open_wait(self.p,'f','reply',0,deadline,0)
    def signal(self,event='e',gen=1,value='yes',now=1): return s.signal(self.p,event,'f','reply',gen,value,now)
    def test_open(self):
        self.assertEqual(self.open(),{'result':'opened','generation':1}); self.assertTrue(s.check_invariants(self.p))
    def test_open_stale(self):
        self.open(); self.assertEqual(self.open()['result'],'stale')
    def test_open_busy(self):
        self.open(); self.assertEqual(s.open_wait(self.p,'f','reply',1,20,1)['result'],'busy')
    def test_open_expired(self): self.assertEqual(self.open(0)['result'],'expired')
    def test_accept_resume(self):
        self.open(); self.assertEqual(self.signal()['result'],'accepted'); self.assertEqual(s.resume(self.p,'f','reply',1),'resumed'); self.assertTrue(s.check_invariants(self.p))
    def test_signal_replay(self):
        self.open(); self.signal(); self.assertEqual(self.signal(now=100),{'result':'replay','original':'accepted'})
    def test_conflict_payload(self):
        self.open(); self.signal(); self.assertEqual(self.signal(value='no'),{'result':'conflict'})
    def test_conflict_generation(self):
        self.open(); self.signal(); self.assertEqual(self.signal(gen=2),{'result':'conflict'})
    def test_conflict_flow(self):
        self.open(); self.signal(); self.assertEqual(s.signal(self.p,'e','g','reply',1,'yes',1),{'result':'conflict'})
    def test_early_reject_persists(self):
        self.assertEqual(self.signal()['result'],'unknown_wait'); self.open(); self.assertEqual(self.signal()['original'],'unknown_wait'); self.assertEqual(s.snapshot(self.p)['waiting'][0]['state'],'waiting')
    def test_boundary_signal(self):
        self.open(); self.assertEqual(self.signal(now=10)['result'],'too_late'); self.assertEqual(s.snapshot(self.p)['waiting'][0]['state'],'timed_out'); self.assertTrue(s.check_invariants(self.p))
    def test_timer_not_due(self): self.open(); self.assertEqual(s.expire(self.p,'f','reply',1,9),'not_due')
    def test_timer_due(self): self.open(); self.assertEqual(s.expire(self.p,'f','reply',1,10),'expired')
    def test_late_after_timeout(self):
        self.open(); s.expire(self.p,'f','reply',1,10); self.assertEqual(self.signal()['result'],'closed')
    def test_timer_after_signal(self):
        self.open(); self.signal(); self.assertEqual(s.expire(self.p,'f','reply',1,10),'closed')
    def test_resume_replay(self):
        self.open(); self.signal(); s.resume(self.p,'f','reply',1); self.assertEqual(s.resume(self.p,'f','reply',1),'replay')
    def test_resume_not_ready(self): self.open(); self.assertEqual(s.resume(self.p,'f','reply',1),'not_ready')
    def test_reopen_requires_consumed(self):
        self.open(); self.signal(); self.assertEqual(s.open_wait(self.p,'f','reply',1,20,2)['result'],'pending_continuation')
    def test_old_signal_cannot_wake_new_generation(self):
        self.open(); self.signal(); s.resume(self.p,'f','reply',1); s.open_wait(self.p,'f','reply',1,20,2)
        self.assertEqual(self.signal(event='late',now=3)['result'],'stale_generation'); self.assertEqual(s.snapshot(self.p)['waiting'][1]['state'],'waiting')
    def test_old_timer_cannot_expire_new(self):
        self.open(); self.signal(); s.resume(self.p,'f','reply',1); s.open_wait(self.p,'f','reply',1,20,2)
        self.assertEqual(s.expire(self.p,'f','reply',1,15),'stale_generation'); self.assertEqual(s.snapshot(self.p)['waiting'][1]['state'],'waiting')
    def test_highwater_prevents_old_clock(self):
        self.open(); s.open_wait(self.p,'other','reply',0,30,12)
        self.assertEqual(self.signal(now=2)['result'],'too_late')
    def test_distinct_steps(self):
        self.open(); s.open_wait(self.p,'f','other',0,10,0); self.signal(); self.assertEqual(s.snapshot(self.p)['waiting'][1]['state'],'waiting')
    def test_utf8_bounds(self):
        with self.assertRaises(ValueError): self.signal(value='中'*86)
    def test_invalid_number(self):
        for n in (True,-1,1.5,2**63):
            with self.assertRaises(ValueError): self.signal(now=n)
    def test_zero_generation(self):
        with self.assertRaises(ValueError): self.signal(gen=0)
    def test_clock_not_changed_by_replay(self):
        self.open(); self.signal(now=2); self.signal(now=100); self.assertEqual(s.snapshot(self.p)['clock'][0]['tick'],2)


if __name__=='__main__': unittest.main()

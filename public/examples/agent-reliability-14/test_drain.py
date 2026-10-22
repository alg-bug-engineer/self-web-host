import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import drain as d

HERE = Path(__file__).resolve().parent


def child(path, expression):
    return subprocess.run([sys.executable, '-c', 'import drain as d; p='+repr(str(path))+';'+expression], cwd=HERE, capture_output=True, text=True, timeout=30)


def race(path, expressions):
    ps = [subprocess.Popen([sys.executable, '-c', 'import sys; import drain as d; p='+repr(str(path))+';print("READY",flush=True);sys.stdin.readline();print('+e+')'], cwd=HERE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for e in expressions]
    # Every process has imported the module before any operation is released.
    for p in ps:
        if p.stdout.readline().strip() != 'READY':
            raise RuntimeError('worker failed before rendezvous')
    for p in ps:
        p.stdin.write('GO\n'); p.stdin.flush()
    results = []
    for p in ps:
        out, err = p.communicate(timeout=30)
        if p.returncode: raise RuntimeError(err)
        results.append(out.strip())
    return results


class DrainTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.p = Path(self.tmp.name)/'queue.db'; d.init(self.p)

    def put(self): return d.admit(self.p, 'job', '合成')
    def drain(self): return d.transition(self.p, 0, 'drain')

    def test_normal_lifecycle(self):
        self.put(); self.drain(); self.assertEqual(d.transition(self.p,1,'pause'),'busy')
        t=d.claim(self.p); self.assertEqual(d.finish(self.p,t),'done')
        self.assertEqual(d.transition(self.p,1,'pause'),'paused')
        self.assertEqual(d.transition(self.p,2,'resume'),'open')
        self.assertEqual(d.snapshot(self.p)['effects'],1)

    def test_closed_replay_and_conflict(self):
        self.put(); self.drain()
        self.assertEqual(self.put(),'replay')
        self.assertEqual(d.admit(self.p,'job','changed'),'conflict')
        self.assertEqual(d.admit(self.p,'new','x'),'closed')

    def test_paused_replay(self):
        self.put(); d.finish(self.p,d.claim(self.p)); self.drain(); d.transition(self.p,1,'pause')
        self.assertEqual(self.put(),'replay'); self.assertIsNone(d.claim(self.p))
        self.assertEqual(d.admit(self.p,'new','x'),'closed')

    def test_stale_resume_cannot_abort_new_drain(self):
        self.drain(); d.transition(self.p,1,'resume'); d.transition(self.p,2,'drain')
        self.assertEqual(d.transition(self.p,1,'resume'),'stale')
        self.assertEqual(d.snapshot(self.p)['mode'],'draining')

    def test_wrong_mode_not_idempotent_success(self):
        self.assertEqual(d.transition(self.p,0,'pause'),'wrong_mode')
        self.drain(); self.assertEqual(d.transition(self.p,0,'drain'),'stale')
        self.assertEqual(d.transition(self.p,1,'drain'),'wrong_mode')

    def test_restart_does_not_reopen(self):
        self.drain(); d.init(self.p); self.assertEqual(d.snapshot(self.p)['mode'],'draining')

    def test_inflight_is_not_empty_queue(self):
        self.put(); d.claim(self.p); self.drain()
        self.assertNotIn('queued',d.snapshot(self.p)['states'])
        self.assertEqual(d.transition(self.p,1,'pause'),'busy')

    def test_quarantine_blocks_and_explicit_repair(self):
        self.put(); t=d.claim(self.p); d.quarantine(self.p,t); self.drain()
        self.assertEqual(d.transition(self.p,1,'pause'),'busy')
        self.assertEqual(d.requeue(self.p,'job'),'queued'); t2=d.claim(self.p)
        self.assertEqual(d.finish(self.p,t),'stale'); d.finish(self.p,t2)
        self.assertEqual(d.transition(self.p,1,'pause'),'paused')

    def test_old_worker_callback_after_pause(self):
        self.put(); t=d.claim(self.p); d.finish(self.p,t); self.drain(); d.transition(self.p,1,'pause')
        self.assertEqual(d.finish(self.p,t),'stale'); self.assertEqual(d.snapshot(self.p)['effects'],1)

    def test_control_crashes(self):
        for point,mode,version in [('before_commit','open',0),('after_commit','draining',1)]:
            p=Path(self.tmp.name)/(point+'.db'); d.init(p)
            r=child(p,"d.transition(p,0,'drain',"+repr(point)+")")
            self.assertEqual(r.returncode,73); s=d.snapshot(p)
            self.assertEqual((s['mode'],s['version']),(mode,version))

    def test_admission_crashes(self):
        for point,count in [('before_commit',0),('after_commit',1)]:
            p=Path(self.tmp.name)/(point+'.db'); d.init(p)
            self.assertEqual(child(p,"d.admit(p,'a','x',"+repr(point)+")").returncode,73)
            self.assertEqual(d.snapshot(p)['outstanding'],count)
            d.transition(p,0,'drain')
            self.assertEqual(d.admit(p,'a','x'),'replay' if count else 'closed')

    def test_finish_crashes(self):
        for point,count in [('after_effect',0),('before_commit',0),('after_commit',1)]:
            p=Path(self.tmp.name)/(point+'.db'); d.init(p); d.admit(p,'a','x'); t=d.claim(p); d.transition(p,0,'drain')
            self.assertEqual(child(p,'d.finish(p,'+repr(t)+','+repr(point)+')').returncode,73)
            s=d.snapshot(p); self.assertEqual(s['effects'],count)
            self.assertEqual(d.transition(p,1,'pause'),'paused' if count else 'busy')

    def test_pause_crashes(self):
        for point,mode in [('before_commit','draining'),('after_commit','paused')]:
            p=Path(self.tmp.name)/(point+'.db'); d.init(p); d.transition(p,0,'drain')
            self.assertEqual(child(p,"d.transition(p,1,'pause',"+repr(point)+")").returncode,73)
            self.assertEqual(d.snapshot(p)['mode'],mode)

    def test_competing_controllers(self):
        out=race(self.p,["d.transition(p,0,'drain')"]*12)
        self.assertEqual(out.count('draining'),1); self.assertEqual(out.count('stale'),11)

    def test_concurrent_admission_and_drain(self):
        expressions=["d.admit(p,'r%d','x')"%i for i in range(12)]+["d.transition(p,0,'drain')"]
        out=race(self.p,expressions); accepted=out.count('accepted')
        self.assertEqual(out.count('closed')+accepted,12)
        self.assertEqual(d.snapshot(self.p)['outstanding'],accepted)
        self.assertEqual(d.admit(self.p,'late','x'),'closed')
        self.assertEqual(d.transition(self.p,1,'pause'),'busy' if accepted else 'paused')

    def test_invalid_control_inputs(self):
        for version in [-1,True,'1']:
            with self.assertRaises(ValueError): d.transition(self.p,version,'drain')
        with self.assertRaises(ValueError): d.transition(self.p,0,'erase')
        with self.assertRaises(ValueError): d.admit(self.p,'','x')

if __name__=='__main__': unittest.main()

import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

import admission as a

HERE = Path(__file__).resolve().parent


def child(path, expression):
    return subprocess.run([sys.executable, '-c', 'import admission as a; p=' + repr(str(path)) + ';' + expression], cwd=HERE, capture_output=True, text=True)


def contention(path, tenants):
    # Every subprocess starts before any result is awaited. Winners are unspecified.
    processes = [subprocess.Popen([sys.executable, '-c',
                 'import admission as a; print(a.admit(' + repr(str(path)) + ',' + repr('r'+str(i)) + ',' + repr(t) + ',"xx"))'],
                 cwd=HERE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                 for i, t in enumerate(tenants)]
    results = []
    for process in processes:
        stdout, stderr = process.communicate(timeout=30)
        if process.returncode:
            raise RuntimeError(stderr)
        results.append(stdout.strip())
    return results


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.p = Path(self.temp.name)/'queue.db'
        a.init(self.p)

    def put(self, rid='one', tenant='a', body='hello'):
        return a.admit(self.p, rid, tenant, body)

    def test_replay_precedes_full(self):
        self.put(); self.put('two'); self.assertEqual(self.put('three'), 'tenant_full')
        self.assertEqual(self.put(), 'replay')
        self.assertEqual(a.snapshot(self.p)['usage'], [2,10])

    def test_conflicting_identity(self):
        self.put()
        self.assertEqual(self.put(body='changed'), 'conflict')
        self.assertEqual(self.put(tenant='b'), 'conflict')

    def test_global_slots(self):
        for i in range(4): self.assertEqual(self.put(str(i),str(i)), 'accepted')
        self.assertEqual(self.put('fifth','z'), 'global_full')

    def test_tenant_utf8_bytes(self):
        self.assertEqual(self.put(body='中'*30), 'accepted')
        self.assertEqual(self.put('two',body='文'*13), 'tenant_full')
        self.assertEqual(a.snapshot(self.p)['usage'], [1,90])

    def test_global_bytes(self):
        for i in range(2): self.put(str(i),str(i),'x'*96)
        self.assertEqual(self.put('third','c','x'*65), 'global_full')
        self.assertEqual(a.snapshot(self.p)['usage'], [2,192])

    def test_oversize_has_no_intent(self):
        self.assertEqual(self.put(body='中'*33), 'oversize')
        self.assertEqual(a.snapshot(self.p)['intents'], 0)
        self.assertEqual(self.put(), 'accepted')

    def test_rejected_id_can_retry_changed_body(self):
        self.put(); self.put('two')
        self.assertEqual(self.put('three'), 'tenant_full')
        a.cancel_unstarted(self.p,'one')
        self.assertEqual(self.put('three',body='different'), 'accepted')

    def test_cancel_only_never_claimed(self):
        self.put(); token=a.claim(self.p,0)
        self.assertEqual(a.cancel_unstarted(self.p,'one'), 'not_cancelled')
        self.assertEqual(a.snapshot(self.p)['usage'], [1,5])
        a.resolve(self.p,token,1,quarantine=True)
        a.redrive(self.p,'one',token['generation'])
        self.assertEqual(a.cancel_unstarted(self.p,'one'), 'not_cancelled')

    def test_cancel_once_and_replay(self):
        self.put()
        self.assertEqual(a.cancel_unstarted(self.p,'one'), 'cancelled')
        self.assertEqual(a.cancel_unstarted(self.p,'one'), 'not_cancelled')
        self.assertEqual(self.put(), 'replay')
        self.assertEqual(a.snapshot(self.p)['usage'], [0,0])

    def test_lease_expiry_keeps_capacity(self):
        self.put(); old=a.claim(self.p,0)
        self.assertEqual(a.resolve(self.p,old,5), 'stale')
        fresh=a.claim(self.p,5)
        self.assertEqual(a.resolve(self.p,old,5), 'stale')
        self.assertEqual(a.snapshot(self.p)['usage'], [1,5])
        self.assertEqual(a.resolve(self.p,fresh,6), 'done')

    def test_quarantine_and_redrive_keep_capacity(self):
        self.put(); token=a.claim(self.p,0)
        self.assertEqual(a.resolve(self.p,token,1,True), 'quarantined')
        self.assertIsNone(a.claim(self.p,2))
        self.assertEqual(a.redrive(self.p,'one',9), 'stale')
        self.assertEqual(a.redrive(self.p,'one',1), 'redriven')
        self.assertEqual(a.snapshot(self.p)['usage'], [1,5])
        fresh=a.claim(self.p,3); self.assertEqual(fresh['generation'],3)
        self.assertEqual(a.resolve(self.p,token,3), 'stale')
        self.assertEqual(a.resolve(self.p,fresh,4), 'done')

    def test_done_duplicate_cannot_release_other_task(self):
        self.put(); self.put('two'); token=a.claim(self.p,0)
        self.assertEqual(a.resolve(self.p,token,1), 'done')
        self.assertEqual(a.resolve(self.p,token,2), 'stale')
        self.assertEqual(a.snapshot(self.p)['usage'], [1,5])
        self.assertEqual(a.snapshot(self.p)['effects'],1)
        self.assertEqual(self.put(), 'replay')

    def test_init_immutable(self):
        a.init(self.p)
        with self.assertRaises(ValueError): a.init(self.p,dict(a.DEFAULT,global_slots=5))
        self.put()

    def test_invalid_input(self):
        for rid in ['', 'a b', '中', 'x'*65, True]:
            with self.assertRaises(ValueError): self.put(rid)
        for body in ['', None, b'x']:
            with self.assertRaises(ValueError): self.put(body=body)
        with self.assertRaises(UnicodeEncodeError): self.put(body='\ud800')
        for tick in [True,-1,1.2]:
            with self.assertRaises(ValueError): a.claim(self.p,tick)
        a.claim(self.p,4)
        with self.assertRaises(ValueError): a.claim(self.p,3)

    def test_failed_queue_insert_rolls_back_intent(self):
        with sqlite3.connect(self.p) as con:
            con.execute("CREATE TRIGGER fail BEFORE INSERT ON task BEGIN SELECT RAISE(ABORT,'injected'); END")
        with self.assertRaises(sqlite3.IntegrityError): self.put()
        self.assertEqual(a.snapshot(self.p)['intents'],0)

    def test_crash_admission_boundaries(self):
        for point in ['between_intent_task','before_admit_commit','after_admit_commit']:
            with self.subTest(point=point):
                result=child(self.p, f'a.admit(p,{point!r},"a","x",fault={point!r})')
                self.assertEqual(result.returncode,73)
                self.assertEqual(a.snapshot(self.p)['intents'], int(point=='after_admit_commit'))
        self.assertEqual(a.admit(self.p,'after_admit_commit','a','x'),'replay')

    def test_crash_effect_boundaries(self):
        self.put(); token=a.claim(self.p,0)
        for point in ['between_effect_done','before_resolve_commit','after_resolve_commit']:
            result=child(self.p,f'a.resolve(p,{token!r},1,fault={point!r})')
            self.assertEqual(result.returncode,73)
            snap=a.snapshot(self.p)
            self.assertEqual(snap['effects'],int(point=='after_resolve_commit'))
            self.assertEqual(snap['usage'][0],int(point!='after_resolve_commit'))

    def test_crash_cancel_boundaries(self):
        self.put()
        for point in ['before_cancel_commit','after_cancel_commit']:
            result=child(self.p,f'a.cancel_unstarted(p,"one",fault={point!r})')
            self.assertEqual(result.returncode,73)
            self.assertEqual(a.snapshot(self.p)['usage'][0],int(point=='before_cancel_commit'))

    def test_concurrent_global_admission(self):
        results=contention(self.p,[str(i) for i in range(12)])
        self.assertEqual(results.count('accepted'),4)
        self.assertEqual(results.count('global_full'),8)
        self.assertEqual(a.snapshot(self.p)['usage'],[4,8])

    def test_concurrent_tenant_admission(self):
        results=contention(self.p,['a']*12)
        self.assertEqual(results.count('accepted'),2)
        self.assertEqual(results.count('tenant_full'),10)
        self.assertEqual(a.snapshot(self.p)['usage'],[2,4])

    def test_terminal_history_not_bounded(self):
        for i in range(10):
            self.assertEqual(self.put(str(i)), 'accepted')
            token=a.claim(self.p,i*2)
            a.resolve(self.p,token,i*2+1)
        self.assertEqual(a.snapshot(self.p)['usage'],[0,0])
        self.assertEqual(a.snapshot(self.p)['intents'],10)


if __name__ == '__main__':
    unittest.main(verbosity=2)

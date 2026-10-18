import multiprocessing as mp
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import saga
from saga import init, init_resource, reserve, release, snapshot, start, status, step, finish


def worker(root, key, gate, queue):
    try:
        gate.wait(timeout=20)
        queue.put(finish(root, key))
    except BaseException as e:
        queue.put(type(e).__name__+':'+str(e))


def crash_worker(root, fault):
    step(root, 'A', fault)


def delayed_worker(root, ready, resume, queue):
    original = saga.reserve
    def delayed(path, key, amount, fault=None):
        ready.set()
        if not resume.wait(20): raise TimeoutError('test gate')
        return original(path, key, amount, fault)
    with patch('saga.reserve', delayed):
        queue.put(step(root, 'A'))


class SagaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        init(self.root, 10, 0)
    def tearDown(self):
        self.temp.cleanup()
    def begin(self):
        start(self.root, 'A', 3)
    def stock(self):
        return snapshot(self.root/'stock.db')
    def test_success(self):
        with tempfile.TemporaryDirectory() as d:
            init(d, 10, 10); start(d, 'A', 3)
            self.assertEqual(finish(d, 'A'), 'done')
            self.assertEqual(snapshot(Path(d)/'stock.db')['used'], 3)
            self.assertEqual(snapshot(Path(d)/'slots.db')['used'], 3)
    def test_abort_compensates(self):
        self.begin(); self.assertEqual(finish(self.root, 'A'), 'aborted')
        self.assertEqual(self.stock()['used'], 0)
    def test_other_reservation_survives(self):
        self.begin(); step(self.root, 'A')
        reserve(self.root/'stock.db', 'B', 2)
        finish(self.root, 'A')
        self.assertEqual(self.stock()['used'], 2)
    def test_duplicate_release_once(self):
        self.begin(); finish(self.root, 'A')
        before=self.stock()
        self.assertEqual(release(self.root/'stock.db', 'A', 3), 'released')
        self.assertEqual(self.stock(), before)
    def test_late_reserve_cannot_revive(self):
        self.begin(); finish(self.root, 'A')
        self.assertEqual(reserve(self.root/'stock.db','A',3),'released')
        self.assertEqual(self.stock()['used'], 0)
    def test_release_before_reserve(self):
        self.assertEqual(release(self.root/'stock.db','late',2),'released')
        self.assertEqual(reserve(self.root/'stock.db','late',2),'released')
        self.assertEqual(self.stock()['used'], 0)
    def test_release_conflict(self):
        reserve(self.root/'stock.db','A',3)
        self.assertEqual(release(self.root/'stock.db','A',4),'conflict')
        self.assertEqual(self.stock()['used'],3)
    def test_reserve_conflict(self):
        reserve(self.root/'stock.db','A',3)
        self.assertEqual(reserve(self.root/'stock.db','A',4),'conflict')
    def test_start_conflict(self):
        self.begin(); self.assertEqual(start(self.root,'A',4),'conflict')
        self.assertEqual(status(self.root,'A'),(3,'stock_pending'))
    def test_start_replay(self):
        self.begin(); self.assertEqual(start(self.root,'A',3),'existing')
    def test_unknown_does_not_compensate(self):
        self.begin(); step(self.root,'A')
        with self.assertRaises(TimeoutError): step(self.root,'A','unavailable')
        self.assertEqual(status(self.root,'A')[1],'slot_pending')
        self.assertEqual(self.stock()['used'],3)
    def test_compensation_unavailable_keeps_pending(self):
        self.begin(); step(self.root,'A'); step(self.root,'A')
        with self.assertRaises(TimeoutError): step(self.root,'A','unavailable')
        self.assertEqual(status(self.root,'A')[1],'release_pending')
        self.assertEqual(self.stock()['used'],3)
    def test_stock_rejection_never_calls_slot(self):
        start(self.root,'A',11); finish(self.root,'A')
        self.assertEqual(snapshot(self.root/'slots.db')['bookings'],[])
    def test_rejection_is_permanent(self):
        reserve(self.root/'stock.db','B',10)
        self.assertEqual(reserve(self.root/'stock.db','A',3),'rejected')
        release(self.root/'stock.db','B',10)
        self.assertEqual(reserve(self.root/'stock.db','A',3),'rejected')
    def test_terminal_replay_no_changes(self):
        self.begin(); finish(self.root,'A'); before=self.stock()
        self.assertEqual(finish(self.root,'A'),'aborted'); self.assertEqual(self.stock(),before)
    def test_init_does_not_reset(self):
        reserve(self.root/'stock.db','B',2); init(self.root,10,0)
        self.assertEqual(self.stock()['used'],2)
    def test_capacity_mismatch(self):
        with self.assertRaises(ValueError): init_resource(self.root/'stock.db',20)
    def test_bad_amounts(self):
        for value in (True,False,0,-1,1.5,'3',1000001):
            with self.subTest(value=value), self.assertRaises(ValueError): start(self.root,'A',value)
    def test_bad_keys(self):
        for key in ('',None,1,'x'*101):
            with self.subTest(key=key), self.assertRaises(ValueError): reserve(self.root/'stock.db',key,1)
    def test_missing_saga(self):
        with self.assertRaises(KeyError): step(self.root,'absent')
    def test_release_rejected_stays_rejected(self):
        reserve(self.root/'stock.db','A',11)
        self.assertEqual(release(self.root/'stock.db','A',11),'rejected')
    def test_stale_forward_worker_after_compensation(self):
        self.begin()
        original = saga.reserve
        def delayed(path, key, amount, fault=None):
            with patch('saga.reserve', original):
                finish(self.root, 'A')
            return original(path, key, amount, fault)
        with patch('saga.reserve', delayed):
            self.assertEqual(step(self.root, 'A'), 'aborted')
        self.assertEqual(self.stock()['used'], 0)

    def test_delayed_process_after_compensation(self):
        self.begin()
        ctx=mp.get_context('spawn'); ready=ctx.Event(); resume=ctx.Event(); q=ctx.Queue()
        p=ctx.Process(target=delayed_worker,args=(str(self.root),ready,resume,q))
        p.start()
        try:
            self.assertTrue(ready.wait(20))
            self.assertEqual(finish(self.root,'A'),'aborted')
        finally:
            resume.set()
        self.assertEqual(q.get(timeout=30),'aborted')
        p.join(30); self.assertEqual(p.exitcode,0)
        self.assertEqual(self.stock()['used'],0)
        q.close(); q.join_thread()
    def test_concurrent_same_saga(self):
        self.begin(); self.run_workers(['A']*6)
        self.assertEqual(self.stock()['used'],0)
        self.assertEqual(len(self.stock()['events']),2)
    def test_concurrent_distinct_sagas(self):
        for i in range(6): start(self.root,str(i),3)
        self.run_workers([str(i) for i in range(6)])
        self.assertEqual(self.stock()['used'],0)
    def run_workers(self, keys):
        ctx=mp.get_context('spawn'); gate=ctx.Barrier(len(keys)); q=ctx.Queue()
        ps=[ctx.Process(target=worker,args=(str(self.root),k,gate,q)) for k in keys]
        for p in ps: p.start()
        results=[q.get(timeout=30) for _ in ps]
        for p in ps:
            p.join(30); self.assertEqual(p.exitcode,0)
        self.assertEqual(results,['aborted']*len(keys))
        q.close(); q.join_thread()
    def crash_case(self, phase_index, fault):
        self.begin()
        for _ in range(phase_index): step(self.root,'A')
        ctx=mp.get_context('spawn'); p=ctx.Process(target=crash_worker,args=(str(self.root),fault))
        p.start(); p.join(30); self.assertEqual(p.exitcode,73)
        self.assertEqual(finish(self.root,'A'),'aborted')
        self.assertEqual(self.stock()['used'],0)
        self.assertEqual(self.stock()['events'],[['A','released',3],['A','reserved',3]])


def add_crash_tests():
    for index, label in enumerate(('stock','slot','release')):
        for point in ('before_commit','after_commit','coordinator_before_commit','coordinator_after_commit'):
            def case(self,i=index,p=point): self.crash_case(i,p)
            setattr(SagaTests,'test_crash_'+label+'_'+point,case)
add_crash_tests()

if __name__=='__main__': unittest.main(verbosity=2)

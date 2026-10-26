import tempfile
import unittest
from pathlib import Path
import cancellation as c


class CancellationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name)/'db'
        c.init(self.db)
        self.steps = ['合成步骤A','合成步骤B']

    def tearDown(self):
        c.check_invariants(self.db)
        self.tmp.cleanup()

    def create(self, steps=None):
        return c.submit(self.db,'j',steps or self.steps)

    def cancel(self, event='c', steps=None):
        return c.request_cancel(self.db,event,'j',steps or self.steps)

    def state(self):
        return c.inspect(self.db)['job'][0]

    def test_submit_replay(self):
        self.assertEqual(self.create(),'created'); self.assertEqual(self.create(),'replay')

    def test_submit_changed_order_conflicts(self):
        self.create(); self.assertEqual(self.create(list(reversed(self.steps))),'conflict')

    def test_early_cancel_tombstone(self):
        self.assertEqual(self.cancel()['result'],'cancelled_before_submit')
        self.assertEqual(self.create(),'blocked_cancelled')
        self.assertEqual(c.reserve(self.db,'j')['status'],'cancelled')
        self.assertEqual(self.state()['admitted'],0)

    def test_tombstone_different_spec_conflict(self):
        self.cancel(); self.assertEqual(self.create(['other']),'conflict')

    def test_cancel_manifest_conflict(self):
        self.create(); self.assertEqual(self.cancel(steps=['other'])['result'],'spec_conflict')
        self.assertEqual(self.state()['control'],'run')

    def test_cancel_receipt_replay(self):
        self.create(); self.cancel(); c.checkpoint(self.db,'j')
        self.assertEqual(self.cancel(),{'delivery':'replay','result':'requested'})

    def test_cancel_event_conflict(self):
        self.cancel(); self.assertEqual(self.cancel(steps=['different'])['result'],'event_conflict')

    def test_cancel_new_id_after_request(self):
        self.create(); self.cancel(); self.assertEqual(self.cancel('c2')['result'],'already_requested')

    def test_cancel_new_id_after_ack(self):
        self.cancel(); self.assertEqual(self.cancel('c2')['result'],'already_acknowledged')

    def test_checkpoint_before_request(self):
        self.create(); self.assertEqual(c.checkpoint(self.db,'j'),'not_requested')

    def test_checkpoint_missing(self):
        self.assertEqual(c.checkpoint(self.db,'j'),'missing')

    def test_checkpoint_replay(self):
        self.create(); self.cancel()
        self.assertEqual(c.checkpoint(self.db,'j'),'acknowledged')
        self.assertEqual(c.checkpoint(self.db,'j'),'replay')

    def test_reserve_only_once(self):
        self.create(); self.assertEqual(c.reserve(self.db,'j'),{'status':'reserved','seq':0})
        self.assertEqual(c.reserve(self.db,'j'),{'status':'inflight','seq':0})

    def test_reserve_missing(self):
        self.assertEqual(c.reserve(self.db,'j')['status'],'missing')

    def test_cancel_blocks_new_reserve(self):
        self.create(); self.cancel(); self.assertEqual(c.reserve(self.db,'j')['status'],'cancel_requested')

    def test_inflight_prevents_ack(self):
        self.create(); c.reserve(self.db,'j'); self.cancel()
        self.assertEqual(c.checkpoint(self.db,'j'),'inflight')

    def test_unknown_prevents_ack(self):
        self.create(); c.reserve(self.db,'j'); c.report(self.db,'u','j',0,'unknown'); self.cancel()
        self.assertEqual(c.checkpoint(self.db,'j'),'inflight')

    def test_cancel_preserves_completed_prefix(self):
        self.create(); c.reserve(self.db,'j'); c.report(self.db,'r','j',0,'ok','kept'); self.cancel()
        c.checkpoint(self.db,'j')
        self.assertEqual([s['state'] for s in c.inspect(self.db)['step']],['ok','pending'])
        self.assertEqual(self.state()['result'],'open')

    def test_late_result_reconciles_cancel(self):
        self.create(); c.reserve(self.db,'j'); self.cancel(); c.report(self.db,'r','j',0,'ok','kept')
        self.assertEqual(c.checkpoint(self.db,'j'),'acknowledged')
        self.assertEqual(c.reserve(self.db,'j')['status'],'cancelled')

    def test_final_success_before_cancel_too_late(self):
        self.create(['a']); c.reserve(self.db,'j'); c.report(self.db,'r','j',0,'ok','done')
        self.assertEqual(self.cancel(steps=['a'])['result'],'too_late')
        self.assertEqual(self.state()['control'],'run')

    def test_final_success_after_cancel_is_preserved(self):
        self.create(['a']); c.reserve(self.db,'j'); self.cancel(steps=['a']); c.report(self.db,'r','j',0,'ok','done')
        c.checkpoint(self.db,'j')
        self.assertEqual((self.state()['control'],self.state()['result']),('acknowledged','succeeded'))

    def test_rejection_blocks_following_steps(self):
        self.create(); c.reserve(self.db,'j'); c.report(self.db,'r','j',0,'rejected','no effect')
        self.assertEqual(c.reserve(self.db,'j')['status'],'terminal')
        self.assertEqual(self.cancel()['result'],'too_late')

    def test_rejection_after_cancel_preserved(self):
        self.create(); c.reserve(self.db,'j'); self.cancel(); c.report(self.db,'r','j',0,'rejected','no effect')
        c.checkpoint(self.db,'j'); self.assertEqual(self.state()['result'],'failed')

    def test_unknown_receipt_does_not_change_after_settle(self):
        self.create(); c.reserve(self.db,'j'); c.report(self.db,'e','j',0,'unknown')
        c.report(self.db,'r','j',0,'ok','yes')
        self.assertEqual(c.report(self.db,'e','j',0,'unknown'),{'delivery':'replay','result':'unresolved'})

    def test_same_event_cannot_change_unknown(self):
        self.create(); c.reserve(self.db,'j'); c.report(self.db,'e','j',0,'unknown')
        self.assertEqual(c.report(self.db,'e','j',0,'ok','yes')['result'],'event_conflict')

    def test_terminal_same_new_event(self):
        self.create(); c.reserve(self.db,'j'); c.report(self.db,'e','j',0,'ok','v')
        self.assertEqual(c.report(self.db,'e2','j',0,'ok','v')['result'],'already_settled')

    def test_terminal_changed_new_event(self):
        self.create(); c.reserve(self.db,'j'); c.report(self.db,'e','j',0,'ok','v')
        self.assertEqual(c.report(self.db,'e2','j',0,'rejected','v')['result'],'terminal_conflict')

    def test_unreserved_rejection_remembered(self):
        self.create(); self.assertEqual(c.report(self.db,'r','j',0,'ok','v')['result'],'not_reserved')
        c.reserve(self.db,'j'); self.assertEqual(c.report(self.db,'r','j',0,'ok','v')['result'],'not_reserved')

    def test_unknown_job_rejection_remembered(self):
        self.assertEqual(c.report(self.db,'r','j',0,'ok')['result'],'unknown_job')
        self.create(); c.reserve(self.db,'j')
        self.assertEqual(c.report(self.db,'r','j',0,'ok')['result'],'unknown_job')

    def test_unknown_step(self):
        self.create(); self.assertEqual(c.report(self.db,'r','j',31,'ok')['result'],'unknown_step')

    def test_cross_command_event_conflict(self):
        self.create(); c.reserve(self.db,'j'); c.report(self.db,'x','j',0,'unknown')
        self.assertEqual(self.cancel('x')['result'],'event_conflict')
        self.assertEqual(self.state()['control'],'run')

    def test_ordered_steps_finish(self):
        self.create(); c.reserve(self.db,'j'); c.report(self.db,'r0','j',0,'ok','a')
        self.assertEqual(c.reserve(self.db,'j')['seq'],1); c.report(self.db,'r1','j',1,'ok','b')
        self.assertEqual(self.state()['result'],'succeeded')

    def test_invalid_spec_limits(self):
        for s in ([],{},['a']*33,[''],['中'*342]):
            with self.subTest(s=str(s)[:20]), self.assertRaises(ValueError): c.submit(self.db,'j',s)

    def test_invalid_identifiers(self):
        for ident in ('',None,'中'*86):
            with self.assertRaises(ValueError): c.submit(self.db,ident,['a'])

    def test_invalid_reports(self):
        for seq,outcome,value in ((True,'ok',''),(-1,'ok',''),(32,'ok',''),(0,'failed',''),(0,'unknown','x'),(0,'ok','中'*342)):
            with self.assertRaises(ValueError): c.report(self.db,'r','j',seq,outcome,value)

    def test_utf8_exact_limits(self):
        self.create(['a'*1024]); c.reserve(self.db,'j')
        c.report(self.db,'e'*256,'j',0,'ok','x'*1024)
        self.assertEqual(self.state()['result'],'succeeded')


if __name__ == '__main__':
    unittest.main()

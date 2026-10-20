import json
import sqlite3
import tempfile
import unittest
from fair_relay import *
from run_experiment import crash_case, concurrent_case


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=self.temp.name;init(self.root)
    def tearDown(self):self.temp.cleanup()
    def add(self,flow='A',n=1,delta=1):
        for k in range(1,n+1):enqueue(self.root,f'{flow}{k}',flow,delta)
    def one(self):return snapshot(self.root)['event'][0]
    def test_empty(self):self.assertIsNone(claim(self.root,0))
    def test_enqueue_idempotency(self):
        self.add();self.assertEqual(enqueue(self.root,'A1','A'),'existing');self.assertEqual(len(snapshot(self.root)['event']),1)
    def test_enqueue_conflict(self):
        self.add();self.assertEqual(enqueue(self.root,'A1','A',2),'conflict')
    def test_round_robin(self):
        for f in 'ABC':self.add(f,3)
        self.assertEqual([step(self.root,0)['event'] for _ in range(9)],['A1','B1','C1','A2','B2','C2','A3','B3','C3'])
    def test_inflight_blocks_same_flow(self):
        self.add(n=2);claim(self.root,0);self.assertIsNone(claim(self.root,1))
    def test_other_flow_still_eligible(self):
        self.add(n=2);self.add('B');claim(self.root,0);self.assertEqual(claim(self.root,0)['event_id'],'B1')
    def test_lease_boundary(self):
        self.add();claim(self.root,0);self.assertIsNone(claim(self.root,4));self.assertEqual(claim(self.root,5)['generation'],2)
    def test_stale_callback(self):
        self.add();old=claim(self.root,0);claim(self.root,5);self.assertEqual(settle(self.root,old,'accepted',5),'stale');self.assertEqual(self.one()['state'],'inflight')
    def test_expired_callback(self):
        self.add();old=claim(self.root,0);self.assertEqual(settle(self.root,old,'accepted',5),'expired')
    def test_ack_duplicate_callback(self):
        self.add();t=claim(self.root,0);self.assertEqual(settle(self.root,t,receive(self.root,t['body']),0),'acked');self.assertEqual(settle(self.root,t,'retry',0),'stale')
    def test_receive_idempotency(self):
        self.add();t=claim(self.root,0);self.assertEqual(receive(self.root,t['body']),'accepted');self.assertEqual(receive(self.root,t['body']),'duplicate');self.assertEqual(snapshot(self.root)['projection'][0]['total'],1)
    def test_receiver_body_conflict(self):
        self.add();t=claim(self.root,0);receive(self.root,t['body']);e=json.loads(t['body']);e['delta']=3
        self.assertEqual(receive(self.root,json.dumps(e)),'id_conflict')
    def test_receiver_sequence_conflict(self):
        self.add();t=claim(self.root,0);receive(self.root,t['body']);e=json.loads(t['body']);e['event_id']='X'
        self.assertEqual(receive(self.root,json.dumps(e)),'sequence_conflict')
    def test_gap_no_effect(self):
        self.add(n=2);s=snapshot(self.root);self.assertEqual(receive(self.root,s['event'][1]['body']),'gap');self.assertEqual(snapshot(self.root)['receipt'],[])
    def test_backoff_persists(self):
        self.add();t=claim(self.root,0);settle(self.root,t,'retry',0);init(self.root);self.assertIsNone(claim(self.root,1));self.assertEqual(claim(self.root,2)['attempts'],2)
    def test_budget_exhaustion(self):
        self.add();self.assertEqual(step(self.root,0,'unavailable')['state'],'ready');step(self.root,2,'unavailable');self.assertEqual(step(self.root,6,'unavailable')['state'],'quarantined');self.assertEqual(self.one()['attempts'],3)
    def test_expired_budget_exhaustion(self):
        self.add()
        for t in [0,5,10]:claim(self.root,t)
        self.assertIsNone(claim(self.root,15));self.assertEqual(self.one()['reason'],'attempt_budget')
    def test_permanent_conflict_quarantine(self):
        self.add();t=claim(self.root,0);self.assertEqual(settle(self.root,t,'id_conflict',0),'quarantined')
    def test_quarantine_blocks_tail(self):
        self.add(n=2);t=claim(self.root,0);settle(self.root,t,'unsupported_delta',0);self.assertIsNone(claim(self.root,100));self.assertEqual(snapshot(self.root)['event'][1]['attempts'],0)
    def test_quarantine_does_not_block_other_flow(self):
        self.add();self.add('B');t=claim(self.root,0);settle(self.root,t,'id_conflict',0);self.assertEqual(step(self.root,0)['event'],'B1')
    def test_redrive_preserves_body_id_and_lifetime(self):
        self.add(delta=10);t=claim(self.root,0);settle(self.root,t,'unsupported_delta',0);self.assertEqual(redrive(self.root,'A1',t['generation'],'decoder checked',1),'ready');e=self.one();self.assertEqual(e['body'],t['body']);self.assertEqual(e['attempts'],0);self.assertEqual(e['lifetime_attempts'],1);self.assertEqual(e['generation'],2)
    def test_redrive_cas(self):
        self.add();t=claim(self.root,0);settle(self.root,t,'id_conflict',0);self.assertEqual(redrive(self.root,'A1',0,'bad generation',1),'stale');self.assertEqual(len(snapshot(self.root)['audit']),0)
    def test_redrive_requires_reason(self):
        with self.assertRaises(ValueError):redrive(self.root,'A1',0,' ',0)
    def test_redrive_not_ack(self):
        self.add();step(self.root,0);self.assertEqual(redrive(self.root,'A1',1,'should not repeat completed item',1),'stale')
    def test_time_cannot_reverse(self):
        claim(self.root,3)
        with self.assertRaises(ValueError):claim(self.root,2)
    def test_invalid_inputs(self):
        for value in [-1,True,0,1.5]:
            with self.assertRaises(ValueError):enqueue(self.root,'A1','A',value)
    def test_unknown_result_is_not_retry(self):
        self.add();t=claim(self.root,0)
        with self.assertRaises(ValueError):settle(self.root,t,'mystery',0)
        self.assertEqual(self.one()['state'],'inflight')
    def test_init_does_not_reset(self):
        self.add();step(self.root,0);s=snapshot(self.root);init(self.root);self.assertEqual(snapshot(self.root),s)
    def test_local_effect_rollback(self):
        self.add();t=claim(self.root,0)
        with db(self.root,'receiver.db',True) as c:c.execute("CREATE TRIGGER deny_effect BEFORE INSERT ON projection BEGIN SELECT RAISE(ABORT,'forced'); END")
        with self.assertRaises(sqlite3.IntegrityError):receive(self.root,t['body'])
        self.assertEqual(snapshot(self.root)['receipt'],[])
    def test_enqueue_rollback(self):
        with db(self.root,'queue.db',True) as c:c.execute("CREATE TRIGGER deny_event BEFORE INSERT ON event BEGIN SELECT RAISE(ABORT,'forced'); END")
        with self.assertRaises(sqlite3.IntegrityError):self.add()
        self.assertEqual(snapshot(self.root)['flow'],[])
    def test_redrive_audit_rollback(self):
        self.add();t=claim(self.root,0);settle(self.root,t,'id_conflict',0)
        with db(self.root,'queue.db',True) as c:c.execute("CREATE TRIGGER deny_audit BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'forced'); END")
        with self.assertRaises(sqlite3.IntegrityError):redrive(self.root,'A1',1,'checked',1)
        self.assertEqual(self.one()['state'],'quarantined')
    def test_late_delivery_is_deduplicated(self):
        self.add();old=claim(self.root,0);new=claim(self.root,5);receive(self.root,old['body']);self.assertEqual(receive(self.root,new['body']),'duplicate');self.assertEqual(settle(self.root,old,'accepted',5),'stale');settle(self.root,new,'duplicate',5);self.assertEqual(len(snapshot(self.root)['receipt']),1)
    def test_new_arrivals_can_overtake_old_flow(self):
        self.add(n=2);step(self.root,0)
        for f in 'BCD':self.add(f);self.assertEqual(step(self.root,0)['event'],f+'1')
        self.assertEqual(self.one()['state'],'acked');self.assertEqual(snapshot(self.root)['event'][1]['attempts'],0)
    def test_concurrent_claims(self):
        r=concurrent_case();self.assertEqual(r['claims'],['A1','B1','C1']);self.assertEqual(r['idle'],5)


def add_crash_test(point):
    def test(self):
        r=crash_case(point);self.assertEqual(len(r['after']['receipt']),1);self.assertEqual(r['after']['event'][0]['state'],'acked')
        self.assertEqual(r['before']['receipt']!=[],point in ['receive_after_commit','settle_before_commit','settle_after_commit'])
    setattr(RelayTests,'test_'+point,test)
for point in ['claim_before_commit','claim_after_commit','receive_before_commit','receive_after_commit','settle_before_commit','settle_after_commit']:add_crash_test(point)
if __name__=='__main__':unittest.main()

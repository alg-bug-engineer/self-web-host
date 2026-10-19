import itertools
import sqlite3
import tempfile
import unittest
from pathlib import Path
import ordered_events as oe
from run_experiment import seed, crashed, parallel, ordered_arrival, CRASHES


class OrderedEventsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        oe.init(self.root)
    def tearDown(self): self.temp.cleanup()
    def event(self):
        oe.advance(self.root, 'A1', 'A', 0, 'reserved')
        return oe.events(self.root)[0]
    def snap(self): return oe.snapshot(self.root)
    def test_producer_state_and_event(self):
        e = self.event()
        self.assertEqual(e['seq'], 1)
        self.assertEqual(self.snap()['flows'], [['A',1,'reserved',3]])
        self.assertEqual(len(self.snap()['outbox']), 1)
    def test_producer_replay_after_later_state(self):
        seed(self.root)
        self.assertEqual(oe.advance(self.root,'A1','A',0,'reserved'),'existing')
        self.assertEqual(len(self.snap()['outbox']),3)
    def test_producer_changed_amount_conflict(self):
        self.event()
        self.assertEqual(oe.advance(self.root,'A1','A',0,'reserved',4),'conflict')
    def test_producer_changed_schema_conflict(self):
        self.event()
        self.assertEqual(oe.advance(self.root,'A1','A',0,'reserved',schema=2),'conflict')
    def test_producer_stale_new_identity(self):
        self.event()
        self.assertEqual(oe.advance(self.root,'other','A',0,'reserved'),'stale')
    def test_invalid_transition_not_written(self):
        self.assertEqual(oe.advance(self.root,'A1','A',0,'confirmed'),'invalid_transition')
        self.assertEqual(self.snap()['flows'],[])
    def test_fixed_amount_across_flow(self):
        self.event()
        self.assertEqual(oe.advance(self.root,'A2','A',1,'confirmed',4),'invalid_transition')
    def test_init_does_not_reset(self):
        self.event(); before=self.snap(); oe.init(self.root)
        self.assertEqual(before,self.snap())
    def test_bad_ids(self):
        for value in ('',None,1,'has space','中','x'*101):
            with self.subTest(value=value), self.assertRaises(ValueError):
                oe.advance(self.root,value,'A',0,'reserved')
    def test_bad_amounts(self):
        for value in (True,False,0,-1,1.5,'3',1000001):
            with self.subTest(value=value), self.assertRaises(ValueError):
                oe.advance(self.root,'A1','A',0,'reserved',value)
    def test_bad_sequence(self):
        for value in (True,-1,oe.MAX_SEQ,1.1,'0'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                oe.advance(self.root,'A1','A',value,'reserved')
    def test_bad_envelope(self):
        e=self.event()
        for changed in (dict(e,seq=True), dict(e,seq=0), dict(e,extra=1), dict(e,schema=0),
                        dict(e,payload=[]),dict(e,payload={'amount':3.0})):
            with self.subTest(value=changed), self.assertRaises(ValueError): oe.receive(self.root,changed)
        self.assertEqual(self.snap()['inbox'],[])
    def test_receipt_does_not_apply(self):
        self.event(); self.assertEqual(oe.relay(self.root),'accepted')
        snap=self.snap()
        self.assertEqual(snap['outbox'][0][-1],1)
        self.assertEqual(snap['inbox'][0][3],'pending')
        self.assertEqual(snap['projections'],[])
    def test_duplicate_normalizes_key_order(self):
        e=self.event(); oe.receive(self.root,e)
        self.assertEqual(oe.receive(self.root,dict(reversed(list(e.items())))),'duplicate')
    def test_same_id_changed_body(self):
        e=self.event(); oe.receive(self.root,e)
        self.assertEqual(oe.receive(self.root,dict(e,payload={'amount':4})),'id_conflict')
    def test_same_id_changed_flow(self):
        e=self.event(); oe.receive(self.root,e)
        self.assertEqual(oe.receive(self.root,dict(e,flow_id='B')),'id_conflict')
    def test_sequence_different_id(self):
        e=self.event(); oe.receive(self.root,e)
        self.assertEqual(oe.receive(self.root,dict(e,event_id='B1')),'sequence_conflict')
    def test_conflict_never_acknowledged(self):
        e=self.event(); oe.receive(self.root,dict(e,payload={'amount':4}))
        self.assertEqual(oe.relay(self.root),'id_conflict')
        self.assertEqual(self.snap()['outbox'][0][-1],0)
    def test_default_relay_conflict_can_starve_other_flow(self):
        e=self.event(); oe.advance(self.root,'B1','B',0,'reserved')
        oe.receive(self.root,dict(e,payload={'amount':4}))
        self.assertEqual([oe.relay(self.root) for _ in range(3)],['id_conflict']*3)
        self.assertEqual([r[-1] for r in self.snap()['outbox']],[0,0])
        self.assertEqual(oe.relay(self.root,'B1'),'accepted')
        self.assertEqual(oe.drain(self.root,'B')['applied'],1)
    def test_all_six_arrival_permutations(self):
        for order in itertools.permutations(range(3)):
            with self.subTest(order=order), tempfile.TemporaryDirectory() as d:
                oe.init(d); stream=seed(d)
                for i in order:
                    oe.receive(d,stream[i]); oe.drain(d,'A')
                self.assertEqual(oe.snapshot(d)['projections'],[['A',3,'released',3,0]])
                self.assertEqual([r[2] for r in oe.snapshot(d)['effects']],[1,2,3])
                with oe.tx(Path(d)/'consumer.db') as c:
                    self.assertEqual([r[0] for r in c.execute('SELECT seq FROM effect ORDER BY rowid')],[1,2,3])
    def test_gap_never_skips(self):
        stream=seed(self.root); oe.receive(self.root,stream[2])
        self.assertEqual(oe.drain(self.root,'A'),{'applied':0,'stop':'gap'})
        self.assertEqual(self.snap()['effects'],[])
    def test_real_process_reordering(self):
        result=ordered_arrival(self.root)
        self.assertEqual(result['after_3'],{'applied':0,'stop':'gap'})
        self.assertEqual(result['after_1'],{'applied':1,'stop':'gap'})
        self.assertEqual(result['after_2'],{'applied':2,'stop':'idle'})
        self.assertEqual(self.snap()['projections'],[['A',3,'released',3,0]])
    def test_other_flow_progresses(self):
        a=seed(self.root); b=seed(self.root,'B')
        oe.receive(self.root,a[2])
        for e in b: oe.receive(self.root,e)
        answer=oe.process_all(self.root)
        self.assertEqual(answer['A']['stop'],'gap')
        self.assertEqual(answer['B']['applied'],3)
    def test_schema_upgrade_reuses_original(self):
        stream=seed(self.root,schema=2)
        for e in stream: oe.receive(self.root,e)
        self.assertEqual(oe.drain(self.root,'A'),{'applied':0,'stop':'unsupported_schema'})
        self.assertEqual(self.snap()['inbox'][0][3],'blocked')
        self.assertEqual(oe.drain(self.root,'A',True),{'applied':3,'stop':'idle'})
        self.assertEqual(oe.events(self.root),stream)
    def test_unknown_schema_stays_blocked(self):
        e=dict(self.event(),schema=3); oe.receive(self.root,e)
        self.assertEqual(oe.apply_next(self.root,'A',True),'unsupported_schema')
        self.assertEqual(self.snap()['effects'],[])
    def test_malformed_payload_stays_blocked(self):
        e=dict(self.event(),payload={'amount':True}); oe.receive(self.root,e)
        self.assertEqual(oe.apply_next(self.root,'A'),'invalid_payload')
    def test_unknown_kind_stays_blocked(self):
        e=dict(self.event(),kind='invented'); oe.receive(self.root,e)
        self.assertEqual(oe.apply_next(self.root,'A'),'invalid_transition')
    def test_applied_duplicate_cannot_repeat(self):
        e=self.event(); oe.receive(self.root,e); oe.drain(self.root,'A')
        self.assertEqual(oe.receive(self.root,e),'duplicate')
        self.assertEqual(oe.drain(self.root,'A')['applied'],0)
        self.assertEqual(len(self.snap()['effects']),1)
    def test_bounded_drain_reports_limit(self):
        for e in seed(self.root): oe.receive(self.root,e)
        self.assertEqual(oe.drain(self.root,'A',limit=1),{'applied':1,'stop':'limit'})
        self.assertEqual(oe.drain(self.root,'A')['applied'],2)
    def test_outbox_failure_rolls_back_flow(self):
        with oe.tx(self.root/'producer.db') as c:
            c.execute("CREATE TRIGGER fail BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'injected'); END")
        with self.assertRaises(sqlite3.IntegrityError): self.event()
        self.assertEqual(self.snap()['flows'],[])
    def test_effect_failure_rolls_back_projection(self):
        oe.receive(self.root,self.event())
        with oe.tx(self.root/'consumer.db') as c:
            c.execute("CREATE TRIGGER fail BEFORE INSERT ON effect BEGIN SELECT RAISE(ABORT,'injected'); END")
        with self.assertRaises(sqlite3.IntegrityError): oe.apply_next(self.root,'A')
        self.assertEqual(self.snap()['projections'],[])
        self.assertEqual(self.snap()['inbox'][0][3],'pending')
    def test_concurrent_same_producer(self):
        answers=parallel(self.root,'advance',['A1']*6)
        self.assertEqual(answers,['committed']+['existing']*5)
        self.assertEqual(len(self.snap()['outbox']),1)
    def test_concurrent_different_producer_ids(self):
        answers=parallel(self.root,'advance',[f'A{i}' for i in range(6)])
        self.assertEqual(answers,['committed']+['stale']*5)
        self.assertEqual(len(self.snap()['outbox']),1)
    def test_concurrent_receivers(self):
        answers=parallel(self.root,'receive',[self.event()]*6)
        self.assertEqual(answers,['accepted']+['duplicate']*5)
    def test_concurrent_applications(self):
        e=self.event(); oe.receive(self.root,e)
        self.assertEqual(parallel(self.root,'apply',[None]*6),['applied']+['idle']*5)
        self.assertEqual(len(self.snap()['effects']),1)
    def test_concurrent_relays(self):
        self.event()
        self.assertTrue(set(parallel(self.root,'relay',[None]*6)) <= {'accepted','duplicate','idle'})
        self.assertEqual(len(self.snap()['inbox']),1)
        self.assertEqual(self.snap()['outbox'][0][-1],1)
    def test_unsafe_dual_write_loses_event(self):
        crashed(self.root,'unsafe',None)
        self.assertEqual(oe.relay(self.root),'idle')
        self.assertEqual(self.snap()['flows'],[['A',1,'reserved',3]])
        self.assertEqual(self.snap()['outbox'],[])
    def test_unsafe_idempotency_does_not_order(self):
        stream=seed(self.root)
        result=oe.unsafe_arrival_order(self.root/'unsafe.db',[stream[i] for i in (2,0,1,2)])
        self.assertEqual(result['view'],[2,'confirmed',3])
        self.assertEqual(result['effect_order'],['released','reserved','confirmed'])
    def crash_case(self, operation, point):
        if operation!='producer': self.event()
        if operation=='apply': oe.relay(self.root)
        crashed(self.root,operation,point)
        before=self.snap()
        if operation=='producer':
            committed = point=='producer_after_commit'
            self.assertEqual(len(before['outbox']),int(committed))
            self.assertEqual(len(before['flows']),int(committed))
        elif operation=='relay':
            self.assertEqual(len(before['inbox']),int(point!='receive_before_commit'))
            self.assertEqual(before['outbox'][0][-1],int(point=='relay_after_ack_commit'))
        else:
            committed = point=='apply_after_commit'
            self.assertEqual(len(before['effects']),int(committed))
            self.assertEqual(len(before['projections']),int(committed))
            self.assertEqual(before['inbox'][0][3],'applied' if committed else 'pending')
        oe.advance(self.root,'A1','A',0,'reserved'); oe.relay(self.root); oe.drain(self.root,'A')
        self.assertEqual(self.snap()['projections'],[['A',1,'reserved',3,3]])
        self.assertEqual(len(self.snap()['effects']),1)
        self.assertEqual(len(self.snap()['inbox']),1)


for _operation, _point in CRASHES:
    def _test(self, operation=_operation, point=_point): self.crash_case(operation,point)
    setattr(OrderedEventsTests,'test_crash_'+_point,_test)

if __name__=='__main__': unittest.main(verbosity=2)

import copy
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
import versioned as v
from run_experiment import setup, exit_at, race, scenarios, total


class VersionedTests(unittest.TestCase):
    def setUp(self):
        self.folder=TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.p=str(Path(self.folder.name)/'test.db')
        setup(self.p)

    def test_definition_content_addressed(self):
        self.assertEqual(v.register(self.p,{'steps':v.V1['steps'],'abi':v.V1['abi']}),v.D1)
        changed=copy.deepcopy(v.V1); changed['steps'][1][1]=2
        self.assertNotEqual(v.register(self.p,changed),v.D1)
        self.assertEqual(v.register(self.p,v.V1),v.D1)

    def test_unsupported_abi_rejected(self):
        bad=copy.deepcopy(v.V1); bad['abi']='local-ledger/2'
        with self.assertRaises(ValueError): v.register(self.p,bad)

    def test_manifest_and_input_validation(self):
        for bad in ({}, {'abi':'local-ledger/1','steps':[]},
                    {'abi':'local-ledger/1','steps':[['a',True]]},
                    {'abi':'local-ledger/1','steps':[['a',1],['a',2]]}):
            with self.assertRaises(ValueError): v.register(self.p,bad)
        for units in (True,0,101,1.5,'10'):
            with self.assertRaises(ValueError): v.admit(self.p,'x',units)

    def test_route_unknown_and_unchanged(self):
        self.assertEqual(v.switch(self.p,1,'missing'),'unknown_definition')
        self.assertEqual(v.switch(self.p,1,v.D1),'unchanged')
        self.assertEqual(v.snapshot(self.p)['route']['revision'],1)

    def test_route_aba_stale(self):
        self.assertEqual(v.switch(self.p,1,v.D2),'switched')
        self.assertEqual(v.switch(self.p,2,v.D1),'switched')
        self.assertEqual(v.switch(self.p,1,v.D2),'stale')

    def test_same_identity_not_rebound(self):
        v.admit(self.p,'a',10); v.switch(self.p,1,v.D2)
        self.assertEqual(v.admit(self.p,'a',10),'replay')
        self.assertEqual(v.admit(self.p,'a',11),'conflict')
        self.assertEqual(v.snapshot(self.p)['jobs'][0]['current_digest'],v.D1)

    def test_unknown_capability_leaves_job_waiting(self):
        v.admit(self.p,'a',10)
        self.assertIsNone(v.claim(self.p,[v.V2]))
        self.assertEqual(v.snapshot(self.p)['unfinished_by_definition'],{v.D1:1})

    def test_supported_job_not_blocked_by_other_head(self):
        v.admit(self.p,'a',10); v.switch(self.p,1,v.D2); v.admit(self.p,'b',10)
        self.assertEqual(v.claim(self.p,[v.V2])[0],'b')

    def test_step_wrong_worker(self):
        v.admit(self.p,'a',10); t=v.claim(self.p,[v.V1])
        self.assertEqual(v.step(self.p,t,[v.V2]),'unsupported')
        self.assertEqual(v.snapshot(self.p)['effects'],[])
        self.assertEqual(v.step(self.p,t,[v.V1]),'ready')

    def test_duplicate_callback_and_completion(self):
        v.admit(self.p,'a',10); t=v.claim(self.p,[v.V1]); v.step(self.p,t,[v.V1])
        self.assertEqual(v.step(self.p,t,[v.V1]),'stale')
        s=v.drain(self.p,[v.V1]); self.assertEqual(total(s,'a'),11)
        self.assertEqual(s['unfinished_by_definition'],{})

    def test_recovery_fences_old_callback(self):
        v.admit(self.p,'a',10); t=v.claim(self.p,[v.V1])
        self.assertEqual(v.recover(self.p,'a',t[2]),'recovered')
        self.assertEqual(v.recover(self.p,'a',t[2]),'stale')
        self.assertEqual(v.step(self.p,t,[v.V1]),'stale')
        s=v.drain(self.p,[v.V1]); self.assertEqual(total(s,'a'),11)

    def test_migrate_only_unstarted(self):
        v.admit(self.p,'a',10); t=v.claim(self.p,[v.V1])
        self.assertEqual(v.migrate(self.p,'a',0,v.D2,'r'),'started')
        v.step(self.p,t,[v.V1])
        self.assertEqual(v.migrate(self.p,'a',0,v.D2,'r'),'started')
        v.drain(self.p,[v.V1])
        self.assertEqual(v.migrate(self.p,'a',0,v.D2,'r'),'started')

    def test_recovered_zero_commit_job_can_migrate(self):
        v.admit(self.p,'a',10); t=v.claim(self.p,[v.V1])
        self.assertEqual(v.recover(self.p,'a',t[2]),'recovered')
        self.assertEqual(v.migrate(self.p,'a',0,v.D2,'explicit changed contract'),'migrated')
        self.assertEqual(v.step(self.p,t,[v.V1]),'stale')
        self.assertIsNone(v.claim(self.p,[v.V1]))
        s=v.drain(self.p,[v.V2])
        self.assertEqual(total(s,'a'),13)
        self.assertTrue(all(e['digest']==v.D2 for e in s['effects']))

    def test_migrate_audited_and_replay_preserves_original(self):
        v.admit(self.p,'a',10)
        self.assertEqual(v.migrate(self.p,'a',0,v.D2,'explicit synthetic decision'),'migrated')
        self.assertEqual(v.migrate(self.p,'a',0,v.D1,'late'),'stale')
        self.assertEqual(v.admit(self.p,'a',10),'replay')
        s=v.drain(self.p,[v.V2])
        self.assertEqual(s['jobs'][0]['accepted_digest'],v.D1)
        self.assertEqual(len(s['migrations']),1); self.assertEqual(total(s,'a'),13)

    def test_migration_preconditions(self):
        self.assertEqual(v.migrate(self.p,'missing',0,v.D2,'r'),'missing')
        v.admit(self.p,'a',10)
        self.assertEqual(v.migrate(self.p,'a',0,'missing','r'),'unknown_definition')
        self.assertEqual(v.migrate(self.p,'a',0,v.D1,'r'),'unchanged')
        with self.assertRaises(ValueError): v.migrate(self.p,'a',0,v.D2,' ')

    def test_admission_crash_before_after(self):
        for fault,expected in [('before_commit','accepted'),('after_commit','replay')]:
            exit_at('admit',[self.p,fault,10,fault])
            self.assertEqual(v.admit(self.p,fault,10),expected)

    def test_claim_crash_and_explicit_recovery(self):
        v.admit(self.p,'a',10)
        exit_at('claim',[self.p,[v.V1],'before_commit'])
        self.assertEqual(v.snapshot(self.p)['jobs'][0]['state'],'ready')
        exit_at('claim',[self.p,[v.V1],'after_commit'])
        self.assertEqual(v.snapshot(self.p)['jobs'][0]['state'],'inflight')
        self.assertIsNone(v.claim(self.p,[v.V1]))
        self.assertEqual(v.recover(self.p,'a',1),'recovered')
        self.assertEqual(total(v.drain(self.p,[v.V1]),'a'),11)

    def test_registry_tampering_is_detected(self):
        v.admit(self.p,'a',10); token=v.claim(self.p,[v.V1])
        with v.transaction(self.p) as db:
            db.execute('UPDATE definition SET body=? WHERE digest=?',(v.canonical(v.V2),v.D1))
        with self.assertRaises(ValueError): v.step(self.p,token,[v.V1])
        self.assertEqual(v.snapshot(self.p)['effects'],[])

    def test_competing_workers_single_claim(self):
        v.admit(self.p,'a',10)
        results=race([('claim',[self.p,[v.V1]]) for _ in range(8)])
        self.assertEqual(sum(x is not None for x in results),1)

    def test_admit_switch_race_only_whole_bindings(self):
        results=race([('admit',[self.p,str(i),10]) for i in range(8)]+[('switch',[self.p,1,v.D2])])
        self.assertEqual(results.count('accepted'),8)
        self.assertEqual(results[-1],'switched')
        s=v.drain(self.p,[v.V1,v.V2])
        for j in s['jobs']:
            self.assertEqual(j['accepted_digest'],j['current_digest'])
            self.assertEqual(total(s,j['id']),11 if j['current_digest']==v.D1 else 13)
            self.assertTrue(all(e['digest']==j['current_digest'] for e in s['effects'] if e['job_id']==j['id']))

    def test_full_frozen_experiments(self):
        import json
        self.assertEqual(scenarios(),json.loads((Path(__file__).parent/'results.json').read_text()))


if __name__=='__main__': unittest.main(verbosity=2)

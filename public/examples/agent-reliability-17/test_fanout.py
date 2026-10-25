import tempfile
import unittest
from pathlib import Path
import fanout as f


class JoinTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / 'join.db'
        f.init(self.db)

    def tearDown(self):
        f.check_invariants(self.db)

    def make(self, manifest=None):
        return f.create(self.db, 'j', manifest or {'a':'lookup A','b':'lookup B'})

    def send(self, event='e', branch='a', outcome='ok', value='A'):
        return f.report(self.db, event, 'j', branch, outcome, value)

    def state(self):
        return f.inspect(self.db)['job'][0]['state']

    def test_fixed_manifest(self):
        self.assertEqual(self.make(), 'created')
        self.assertEqual(len(f.inspect(self.db)['branch']), 2)
    def test_create_replay(self):
        self.make(); self.assertEqual(self.make(), 'replay')
    def test_manifest_order_irrelevant(self):
        self.make(); self.assertEqual(self.make({'b':'lookup B','a':'lookup A'}), 'replay')
    def test_member_change_conflicts(self):
        self.make(); self.assertEqual(self.make({'a':'lookup A'}), 'conflict')
    def test_request_change_conflicts(self):
        self.make(); self.assertEqual(self.make({'a':'other','b':'lookup B'}), 'conflict')
    def test_single_result_not_ready(self):
        self.make(); self.send(); self.assertEqual(self.state(), 'open')
        self.assertEqual(f.consume(self.db,'j'), 'not_ready')
    def test_all_success(self):
        self.make(); self.send(); self.send('e2','b','ok','B')
        self.assertEqual(self.state(), 'succeeded')
    def test_rejection_waits_for_others(self):
        self.make(); self.send(outcome='rejected',value='not available')
        self.assertEqual(self.state(), 'open')
        self.send('e2','b','ok','B'); self.assertEqual(self.state(),'failed')
    def test_unknown_is_not_terminal(self):
        self.make(); self.send(outcome='unknown',value=''); self.send('e2','b','ok','B')
        self.assertEqual(self.state(),'open')
    def test_reconcile_with_new_event(self):
        self.make(); self.send(outcome='unknown',value=''); self.send('e2','b','ok','B')
        self.send('resolved','a','ok','A'); self.assertEqual(self.state(),'succeeded')
    def test_same_unknown_event_cannot_be_rewritten(self):
        self.make(); self.send(outcome='unknown',value='')
        self.assertEqual(self.send()['result'],'event_conflict')
        self.assertEqual(f.inspect(self.db)['branch'][0]['state'],'unknown')
    def test_exact_event_replay(self):
        self.make(); self.send()
        self.assertEqual(self.send(), {'delivery':'replay','result':'recorded'})
    def test_new_event_same_branch_not_counted(self):
        self.make(); self.send()
        self.assertEqual(self.send('e2')['result'],'already_terminal')
        self.assertEqual(self.state(),'open')
    def test_branch_terminal_conflict(self):
        self.make(); self.send()
        self.assertEqual(self.send('e2',value='changed')['result'],'terminal_conflict')
    def test_terminal_cannot_become_unknown(self):
        self.make(); self.send()
        self.assertEqual(self.send('e2',outcome='unknown',value='')['result'],'terminal_conflict')
    def test_event_binds_target(self):
        self.make(); self.send()
        self.assertEqual(self.send(branch='b')['result'],'event_conflict')
    def test_unknown_job_receipt_stays_rejected(self):
        self.assertEqual(self.send()['result'],'unknown_job'); self.make()
        self.assertEqual(self.send(), {'delivery':'replay','result':'unknown_job'})
        self.assertEqual(self.state(),'open')
    def test_unknown_branch(self):
        self.make(); self.assertEqual(self.send(branch='c')['result'],'unknown_branch')
    def test_consume_exact_snapshot(self):
        self.make(); self.send(); self.send('e2','b','ok','B')
        self.assertEqual(f.consume(self.db,'j'),'consumed')
        view=f.inspect(self.db)
        self.assertEqual(view['effect'][0]['snapshot'],view['continuation'][0]['snapshot'])
    def test_consume_replay(self):
        self.make({'a':'A'}); self.send(); f.consume(self.db,'j')
        self.assertEqual(f.consume(self.db,'j'),'replay')
        self.assertEqual(len(f.inspect(self.db)['effect']),1)
    def test_closed_manifest_still_bound(self):
        self.make({'a':'A'}); self.send(); f.consume(self.db,'j')
        self.assertEqual(f.create(self.db,'j',{'b':'B'}),'conflict')
    def test_output_order_stable(self):
        self.make(); self.send('b','b','ok','B'); self.send()
        self.assertEqual(f.inspect(self.db)['continuation'][0]['snapshot'],
                         '[{"id":"a","state":"ok","value":"A"},{"id":"b","state":"ok","value":"B"}]')
    def test_empty_and_oversize_manifest(self):
        for manifest in ({}, {str(i):'x' for i in range(33)}, []):
            with self.assertRaises(ValueError): f.create(self.db,'j',manifest)
    def test_identifier_and_utf8_bounds(self):
        for identifier in ('',True,'中'*86):
            with self.assertRaises(ValueError): f.create(self.db,identifier,{'a':'A'})
        with self.assertRaises(ValueError): f.create(self.db,'j',{'a':'中'*342})
    def test_invalid_outcome_and_value(self):
        self.make()
        for outcome,value in [('pending',''),('unknown','not blank'),('ok',None),('ok','中'*342)]:
            with self.assertRaises(ValueError): self.send(outcome=outcome,value=value)
    def test_separate_job_identity(self):
        self.make({'a':'A'}); f.create(self.db,'j2',{'a':'A'})
        self.send()
        self.assertEqual(f.report(self.db,'e','j2','a','ok','A')['result'],'event_conflict')
        self.assertEqual(f.inspect(self.db)['job'][1]['state'],'open')


if __name__ == '__main__': unittest.main()

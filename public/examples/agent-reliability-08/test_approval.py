import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from approval import (MAX, base_plan, canonical, change, connection, digest,
                      execute, grant, initialize, revoke, snapshot)
from run_experiment import crash_run, revocation_race, run


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'test.db'
        initialize(self.path)
        self.plan = base_plan()
        grant(self.path, 'g1', 'op1', self.plan, 20)

    def execute(self, **kwargs):
        args = dict(path=self.path, aid='g1', op='op1', plan=self.plan, now=10)
        args.update(kwargs)
        return execute(**args)

    def assertClean(self):
        s = snapshot(self.path)
        self.assertEqual((s['effects'], s['receipts'], s['approvals']['g1']), (0, 0, 'active'))
        self.assertEqual(s['resources']['A']['quota'], 10)

    def test_apply(self):
        self.assertEqual(self.execute(), {'status': 'completed', 'result': {'status': 'applied'}})
        self.assertEqual(snapshot(self.path)['approvals']['g1'], 'consumed')

    def test_replay_after_expiry(self):
        self.execute()
        self.assertEqual(self.execute(now=30)['status'], 'replayed')
        self.assertEqual(snapshot(self.path)['effects'], 1)

    def test_amount_change(self):
        self.plan['amount'] = 4
        self.assertEqual(self.execute()['status'], 'approval_mismatch')
        self.assertClean()

    def test_destination_change(self):
        self.plan['dst'] = 'C'; self.plan['expected'] = {'A': 1, 'C': 1}
        self.assertEqual(self.execute()['status'], 'approval_mismatch')

    def test_revision_change(self):
        self.plan['expected']['B'] = 2
        self.assertEqual(self.execute()['status'], 'approval_mismatch')

    def test_operation_change(self):
        self.assertEqual(self.execute(op='op2')['status'], 'approval_mismatch')

    def test_missing_approval(self):
        self.assertEqual(self.execute(aid='absent')['status'], 'approval_missing')
        self.assertClean()

    def test_expiry_exact_boundary(self):
        self.assertEqual(self.execute(now=20)['status'], 'approval_expired')
        self.assertClean()

    def test_before_expiry(self):
        self.assertEqual(self.execute(now=19)['result']['status'], 'applied')

    def test_revoke_before(self):
        self.assertEqual(revoke(self.path, 'g1'), 'revoked')
        self.assertEqual(self.execute()['status'], 'approval_revoked')
        self.assertEqual(snapshot(self.path)['effects'], 0)

    def test_revoke_after(self):
        self.execute()
        self.assertEqual(revoke(self.path, 'g1'), 'consumed')
        self.assertEqual(self.execute()['status'], 'replayed')

    def test_revoke_idempotent(self):
        revoke(self.path, 'g1')
        self.assertEqual(revoke(self.path, 'g1'), 'revoked')
        self.assertEqual(revoke(self.path, 'missing'), 'missing')

    def test_stale_consumes_and_remembers(self):
        change(self.path, 'B', 2)
        self.assertEqual(self.execute()['result']['status'], 'stale')
        self.assertEqual(self.execute(now=30)['result']['status'], 'stale')
        self.assertEqual(snapshot(self.path)['approvals']['g1'], 'consumed')
        self.assertEqual(snapshot(self.path)['effects'], 0)

    def test_changed_plan_after_receipt_conflicts(self):
        self.execute(); self.plan['amount'] = 4
        self.assertEqual(self.execute()['status'], 'conflict')

    def test_changed_grant_after_receipt_conflicts(self):
        self.execute()
        grant(self.path, 'g2', 'op1', self.plan, 30)
        self.assertEqual(self.execute(aid='g2')['status'], 'conflict')

    def test_duplicate_grant_cannot_overwrite(self):
        with self.assertRaises(sqlite3.IntegrityError):
            grant(self.path, 'g1', 'op2', self.plan, 40)
        self.assertEqual(self.execute()['result']['status'], 'applied')

    def test_insufficient_is_terminal(self):
        p = base_plan(); p['amount'] = 11
        grant(self.path, 'g2', 'op2', p, 20)
        self.assertEqual(self.execute(aid='g2', op='op2', plan=p)['result']['status'], 'insufficient')
        self.assertEqual(self.execute(aid='g2', op='op2', plan=p)['status'], 'replayed')

    def test_missing_resource(self):
        with connection(self.path) as c:
            c.execute("DELETE FROM resource WHERE name='B'")
        self.assertEqual(self.execute()['result']['status'], 'missing_resource')

    def test_revision_overflow(self):
        with connection(self.path) as c:
            c.execute("UPDATE resource SET rev=? WHERE name='A'", (MAX,))
        p = base_plan(); p['expected']['A'] = MAX
        grant(self.path, 'g2', 'op2', p, 20)
        self.assertEqual(self.execute(aid='g2', op='op2', plan=p)['result']['status'], 'overflow')

    def test_quota_overflow(self):
        with connection(self.path) as c:
            c.execute("UPDATE resource SET quota=? WHERE name='B'", (MAX,))
        self.assertEqual(self.execute()['result']['status'], 'overflow')

    def test_boolean_rejected(self):
        for field in ('schema', 'amount'):
            p = base_plan(); p[field] = True
            with self.assertRaises(ValueError): canonical(p)
        p = base_plan(); p['expected']['A'] = True
        with self.assertRaises(ValueError): canonical(p)
        with self.assertRaises(ValueError): self.execute(now=True)
        self.assertClean()

    def test_invalid_schema_fields_and_bounds(self):
        cases = []
        for amount in (0, -1, MAX + 1, 1.0, float('nan')):
            p = base_plan(); p['amount'] = amount; cases.append(p)
        p = base_plan(); p['extra'] = 'ignored?'; cases.append(p)
        p = base_plan(); p['schema'] = 2; cases.append(p)
        p = base_plan(); p['dst'] = 'A'; cases.append(p)
        p = base_plan(); p['expected'] = {'A': 1}; cases.append(p)
        p = base_plan(); p['src'] = 'A\n'; cases.append(p)
        for p in cases:
            with self.subTest(plan=p), self.assertRaises(ValueError): canonical(p)
        self.assertClean()

    def test_key_order_stability(self):
        p = dict(reversed(list(self.plan.items())))
        p['expected'] = {'B': 1, 'A': 1}
        self.assertEqual(digest(p), digest(self.plan))

    def test_sql_failure_rolls_back_consumption(self):
        with connection(self.path) as c:
            c.execute("CREATE TRIGGER fail_receipt BEFORE INSERT ON receipt BEGIN SELECT RAISE(ABORT,'injected'); END")
        with self.assertRaises(sqlite3.IntegrityError): self.execute()
        self.assertClean()

    def test_crash_stages(self):
        # Child protocol uses its own named fixture; each stage gets an independent DB.
        for stage, code in [('after_consume', 81), ('before_commit', 82), ('after_commit', 83)]:
            path = Path(self.temp.name) / (stage + '.db')
            initialize(path); grant(path, 'grant-1', 'job-1', base_plan(), 20)
            self.assertEqual(crash_run(path, stage), code)
            before = snapshot(path)
            self.assertEqual(before['effects'], int(stage == 'after_commit'))
            self.assertEqual(before['approvals']['grant-1'], 'consumed' if stage == 'after_commit' else 'active')
            reply = execute(path, 'grant-1', 'job-1', base_plan(), 11)
            self.assertEqual(reply['status'], 'replayed' if stage == 'after_commit' else 'completed')
            self.assertEqual(snapshot(path)['effects'], 1)

    def test_revoke_handshake_counterexample(self):
        for mode, effects in [('unsafe_revocation', 1), ('safe_revocation', 0)]:
            path = Path(self.temp.name) / (mode + '.db')
            initialize(path); grant(path, 'grant-1', 'job-1', base_plan(), 20)
            result = revocation_race(path, mode)
            self.assertEqual(result['state']['effects'], effects)
            self.assertEqual(result['state']['approvals']['grant-1'], 'revoked')

    def test_complete_replay(self):
        result = run()
        self.assertEqual(result, json.loads((Path(__file__).parent / 'results.json').read_text()))
        self.assertEqual(result['concurrent_duplicates']['statuses'], {'completed': 1, 'replayed': 15})


if __name__ == '__main__':
    unittest.main(verbosity=2)

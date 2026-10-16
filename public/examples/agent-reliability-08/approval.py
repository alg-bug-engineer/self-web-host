"""Trusted local approval ledger; NOT an authentication/authorization service."""
import hashlib
import json
import os
import re
import sqlite3
from contextlib import contextmanager

MAX = 2**63 - 1


def ident(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value):
        raise ValueError('identifier must be 1..64 ASCII letters/digits/_/-')
    return value


def integer(value, minimum=0):
    if type(value) is not int or not minimum <= value <= MAX:
        raise ValueError('out of range integer')
    return value


def canonical(plan):
    if not isinstance(plan, dict) or set(plan) != {'schema', 'src', 'dst', 'amount', 'expected'}:
        raise ValueError('unexpected plan fields')
    if type(plan['schema']) is not int or plan['schema'] != 1:
        raise ValueError('unsupported schema')
    src, dst = ident(plan['src']), ident(plan['dst'])
    if src == dst:
        raise ValueError('distinct resources required')
    integer(plan['amount'], 1)
    expected = plan['expected']
    if not isinstance(expected, dict) or set(expected) != {src, dst}:
        raise ValueError('both resource revisions required')
    for value in expected.values():
        integer(value, 1)
    return json.dumps(plan, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)


def digest(plan):
    return hashlib.sha256(canonical(plan).encode('ascii')).hexdigest()


@contextmanager
def connection(path):
    c = sqlite3.connect(path, isolation_level=None, timeout=15)
    c.execute('PRAGMA synchronous=FULL')
    try:
        yield c
    finally:
        c.close()


@contextmanager
def transaction(c):
    c.execute('BEGIN IMMEDIATE')
    try:
        yield
        c.execute('COMMIT')
    except BaseException:
        if c.in_transaction:
            c.execute('ROLLBACK')
        raise


def initialize(path):
    with connection(path) as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE resource(name TEXT PRIMARY KEY, quota INTEGER NOT NULL, rev INTEGER NOT NULL);
        INSERT INTO resource VALUES ('A',10,1),('B',0,1),('C',0,1);
        CREATE TABLE approval(id TEXT PRIMARY KEY, op TEXT NOT NULL, digest TEXT NOT NULL,
          plan TEXT NOT NULL, expires INTEGER NOT NULL, state TEXT NOT NULL);
        CREATE TABLE receipt(op TEXT PRIMARY KEY, approval_id TEXT NOT NULL,
          digest TEXT NOT NULL, result TEXT NOT NULL);
        CREATE TABLE effect(op TEXT PRIMARY KEY, src TEXT NOT NULL, dst TEXT NOT NULL, amount INTEGER NOT NULL);
        ''')


def grant(path, aid, op, plan, expires):
    """Fixture for an already trusted approval decision, no identity verification."""
    ident(aid); ident(op); integer(expires, 1)
    encoded = canonical(plan)
    fingerprint = hashlib.sha256(encoded.encode('ascii')).hexdigest()
    with connection(path) as c, transaction(c):
        c.execute('INSERT INTO approval VALUES (?,?,?,?,?,?)',
                  (aid, op, fingerprint, encoded, expires, 'active'))


def revoke(path, aid):
    ident(aid)
    with connection(path) as c, transaction(c):
        row = c.execute('SELECT state FROM approval WHERE id=?', (aid,)).fetchone()
        if not row:
            return 'missing'
        if row[0] == 'active':
            c.execute("UPDATE approval SET state='revoked' WHERE id=?", (aid,))
            return 'revoked'
        return row[0]


def change(path, name, delta):
    """Trusted test fixture for a competing business write."""
    ident(name)
    if type(delta) is not int:
        raise ValueError('integer delta required')
    with connection(path) as c, transaction(c):
        quota, rev = c.execute('SELECT quota,rev FROM resource WHERE name=?', (name,)).fetchone()
        integer(quota + delta); integer(rev + 1, 1)
        c.execute('UPDATE resource SET quota=?,rev=? WHERE name=?', (quota + delta, rev + 1, name))


def execute(path, aid, op, plan, now, crash=None):
    """now is a trusted logical admission time, not a caller-controlled production clock."""
    ident(aid); ident(op); integer(now)
    plan = json.loads(canonical(plan))  # Freeze the validated request before using it.
    fingerprint = digest(plan)
    with connection(path) as c, transaction(c):
        old = c.execute('SELECT approval_id,digest,result FROM receipt WHERE op=?', (op,)).fetchone()
        if old:
            if old[:2] != (aid, fingerprint):
                return {'status': 'conflict'}
            return {'status': 'replayed', 'result': json.loads(old[2])}
        approval = c.execute('SELECT op,digest,expires,state FROM approval WHERE id=?', (aid,)).fetchone()
        if not approval:
            return {'status': 'approval_missing'}
        if approval[:2] != (op, fingerprint):
            return {'status': 'approval_mismatch'}
        if approval[3] != 'active':
            return {'status': 'approval_' + approval[3]}
        if now >= approval[2]:
            return {'status': 'approval_expired'}
        # Consume the trusted approval and commit its terminal business result atomically.
        c.execute("UPDATE approval SET state='consumed' WHERE id=?", (aid,))
        if crash == 'after_consume':
            os._exit(81)
        rows = dict((name, (quota, rev)) for name, quota, rev in
                    c.execute('SELECT name,quota,rev FROM resource WHERE name IN (?,?)', (plan['src'], plan['dst'])))
        if len(rows) != 2:
            result = {'status': 'missing_resource'}
        elif any(rows[name][1] != rev for name, rev in plan['expected'].items()):
            result = {'status': 'stale'}
        elif rows[plan['src']][0] < plan['amount']:
            result = {'status': 'insufficient'}
        elif any(row[1] == MAX for row in rows.values()) or rows[plan['dst']][0] > MAX - plan['amount']:
            result = {'status': 'overflow'}
        else:
            c.execute('UPDATE resource SET quota=quota-?,rev=rev+1 WHERE name=?', (plan['amount'], plan['src']))
            c.execute('UPDATE resource SET quota=quota+?,rev=rev+1 WHERE name=?', (plan['amount'], plan['dst']))
            c.execute('INSERT INTO effect VALUES (?,?,?,?)', (op, plan['src'], plan['dst'], plan['amount']))
            result = {'status': 'applied'}
        c.execute('INSERT INTO receipt VALUES (?,?,?,?)', (op, aid, fingerprint, json.dumps(result, sort_keys=True)))
        if crash == 'before_commit':
            os._exit(82)
    if crash == 'after_commit':
        os._exit(83)
    return {'status': 'completed', 'result': result}


def snapshot(path):
    with connection(path) as c:
        return {
            'resources': {name: {'quota': quota, 'rev': rev} for name, quota, rev in c.execute('SELECT * FROM resource ORDER BY name')},
            'approvals': dict(c.execute('SELECT id,state FROM approval ORDER BY id')),
            'effects': c.execute('SELECT COUNT(*) FROM effect').fetchone()[0],
            'receipts': c.execute('SELECT COUNT(*) FROM receipt').fetchone()[0],
        }


def base_plan():
    return {'schema': 1, 'src': 'A', 'dst': 'B', 'amount': 3, 'expected': {'A': 1, 'B': 1}}

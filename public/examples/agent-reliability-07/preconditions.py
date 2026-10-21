"""Same-host synthetic quota transfers. Trusted fixtures, not an authorization API."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
import sqlite3
import sys

@contextmanager
def connect(path):
    c = sqlite3.connect(path, timeout=15, isolation_level=None)
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

def init(path):
    with connect(path) as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS resource(name TEXT PRIMARY KEY, quota INTEGER NOT NULL CHECK(quota>=0), revision INTEGER NOT NULL CHECK(revision>=1));
        CREATE TABLE IF NOT EXISTS receipt(op TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS effect(id INTEGER PRIMARY KEY, op TEXT NOT NULL, src TEXT NOT NULL, dst TEXT NOT NULL, amount INTEGER NOT NULL);
        ''')
        with transaction(c):
            c.executemany('INSERT OR IGNORE INTO resource VALUES (?,?,1)', [('A',10),('B',0),('C',5)])

def snapshot(path):
    with connect(path) as c:
        c.execute('BEGIN')
        return {'resources':{name:{'quota':quota,'revision':revision} for name,quota,revision in c.execute('SELECT * FROM resource ORDER BY name')},
                'effects':c.execute('SELECT COUNT(*) FROM effect').fetchone()[0],
                'receipts':c.execute('SELECT COUNT(*) FROM receipt').fetchone()[0]}

def plan(path, src='A', dst='B', amount=3):
    state = snapshot(path)['resources']
    return {'src':src,'dst':dst,'amount':amount,
            'expected':{src:state[src]['revision'],dst:state[dst]['revision']}}

def validate(command):
    if not isinstance(command, dict) or set(command) != {'src','dst','amount','expected'}:
        raise ValueError('exact command fields required')
    a,b = command['src'],command['dst']
    if not all(type(v) is str and v for v in (a,b)) or a == b:
        raise ValueError('distinct nonempty resource names required')
    if type(command['amount']) is not int or not 1 <= command['amount'] <= 1000000:
        raise ValueError('amount must be an integer in [1,1000000]')
    expected = command['expected']
    if not isinstance(expected,dict) or set(expected) != {a,b} or any(type(v) is not int or not 1 <= v <= 2**63-1 for v in expected.values()):
        raise ValueError('complete positive integer revision set required')
    # This is a deliberately restricted JSON command, not universal canonical JSON.
    return hashlib.sha256(json.dumps(command,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

def change(path, name, delta):
    """Trusted fixture mutation. Every participating writer MUST advance revision."""
    if type(delta) is not int:
        raise ValueError('integer delta required')
    with connect(path) as c, transaction(c):
        row = c.execute('SELECT quota,revision FROM resource WHERE name=?',(name,)).fetchone()
        if row is None or not 0 <= row[0]+delta <= 2**63-1 or row[1] >= 2**63-1:
            raise ValueError('invalid mutation')
        c.execute('UPDATE resource SET quota=quota+?,revision=revision+1 WHERE name=?',(delta,name))

def execute(path, op, command, fault='none'):
    if type(op) is not str or not op:
        raise ValueError('nonempty operation ID required')
    digest = validate(command)
    if fault not in {'none','after_source','before_commit','after_commit'}:
        raise ValueError('unknown fault')
    with connect(path) as c, transaction(c):
        old = c.execute('SELECT digest,result FROM receipt WHERE op=?',(op,)).fetchone()
        if old:
            if old[0] != digest:
                return {'status':'conflict'}
            return {'status':'replayed','result':json.loads(old[1])}
        rows = {name:(quota,rev) for name,quota,rev in c.execute('SELECT * FROM resource WHERE name IN (?,?)',(command['src'],command['dst']))}
        if len(rows) != 2:
            result = {'status':'missing_resource'}
        elif any(rows[name][1] != rev for name,rev in command['expected'].items()):
            result = {'status':'stale','observed':{name:rows[name][1] for name in sorted(rows)}}
        elif any(rev >= 2**63-1 for _,rev in rows.values()):
            result = {'status':'revision_exhausted'}
        elif rows[command['src']][0] < command['amount']:
            result = {'status':'insufficient'}
        elif rows[command['dst']][0] > 2**63-1-command['amount']:
            result = {'status':'quota_exhausted'}
        else:
            c.execute('UPDATE resource SET quota=quota-?,revision=revision+1 WHERE name=?',(command['amount'],command['src']))
            if fault == 'after_source':
                os._exit(71)
            c.execute('UPDATE resource SET quota=quota+?,revision=revision+1 WHERE name=?',(command['amount'],command['dst']))
            effect = c.execute('INSERT INTO effect(op,src,dst,amount) VALUES (?,?,?,?)',(op,command['src'],command['dst'],command['amount'])).lastrowid
            result = {'status':'applied','effect':effect}
        # Rejections are terminal for this ID too. A replan is a different decision.
        c.execute('INSERT INTO receipt VALUES (?,?,?)',(op,digest,json.dumps(result,sort_keys=True)))
        if fault == 'before_commit':
            os._exit(72)
    if fault == 'after_commit':
        os._exit(73)
    return {'status':'completed','result':result}

def unsafe_checked_then_apply(path, op, command):
    """Counterexample ONLY: validate outside transaction, pause, then blindly write."""
    validate(command)
    current = snapshot(path)['resources']
    if any(current[name]['revision'] != rev for name,rev in command['expected'].items()):
        raise ValueError('fixture must initially match')
    print('READY',flush=True)
    if sys.stdin.readline().strip() != 'GO':
        raise ValueError('GO required')
    # Intentionally does not recheck revisions. Never call from the safe executor.
    with connect(path) as c, transaction(c):
        c.execute('UPDATE resource SET quota=quota-?,revision=revision+1 WHERE name=?',(command['amount'],command['src']))
        c.execute('UPDATE resource SET quota=quota+?,revision=revision+1 WHERE name=?',(command['amount'],command['dst']))
        c.execute('INSERT INTO effect(op,src,dst,amount) VALUES (?,?,?,?)',(op,command['src'],command['dst'],command['amount']))
    return {'status':'unsafe_applied'}

if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('db'); p.add_argument('op'); p.add_argument('command')
    p.add_argument('--fault',default='none'); p.add_argument('--wait',action='store_true'); p.add_argument('--unsafe',action='store_true')
    args=p.parse_args(); command=json.loads(args.command)
    if args.unsafe:
        result=unsafe_checked_then_apply(args.db,args.op,command)
    else:
        if args.wait:
            print('READY',flush=True)
            if sys.stdin.readline().strip() != 'GO':
                raise ValueError('GO required')
        result=execute(args.db,args.op,command,args.fault)
    print(json.dumps(result,sort_keys=True),flush=True)

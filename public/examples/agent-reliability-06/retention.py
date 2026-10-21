"""Trusted, same-host mechanism experiment. No authentication or external I/O."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3

@contextmanager
def connection(path):
    c = sqlite3.connect(path, timeout=10, isolation_level=None)
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

def init(path, namespace='demo'):
    with connection(path) as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS boundary(namespace TEXT PRIMARY KEY, closed_through INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS receipt(namespace TEXT, epoch INTEGER, op TEXT, digest TEXT NOT NULL,
          result INTEGER, PRIMARY KEY(namespace,epoch,op));
        CREATE TABLE IF NOT EXISTS effect(id INTEGER PRIMARY KEY, namespace TEXT, epoch INTEGER, op TEXT, body TEXT);
        ''')
        c.execute('INSERT OR IGNORE INTO boundary VALUES (?,0)', (namespace,))

def positive(value):
    if type(value) is not int or value < 1:
        raise ValueError('epoch must be a positive integer')

def fingerprint(body):
    # Exact UTF-8 string contract, not a general JSON canonicalization algorithm.
    if not isinstance(body, str):
        raise ValueError('body must be text')
    return hashlib.sha256(body.encode('utf-8')).hexdigest()

def execute(path, epoch, op, body='synthetic ticket', namespace='demo', fault='none'):
    positive(epoch)
    if not isinstance(op, str) or not op:
        raise ValueError('nonempty operation identifier required')
    digest = fingerprint(body)
    with connection(path) as c, transaction(c):
        row = c.execute('SELECT closed_through FROM boundary WHERE namespace=?', (namespace,)).fetchone()
        if row is None:
            return {'status':'unknown_namespace'}
        # Must be checked even when no receipt exists. All writes share this transaction.
        if epoch <= row[0]:
            return {'status':'closed'}
        old = c.execute('SELECT digest,result FROM receipt WHERE namespace=? AND epoch=? AND op=?',
                        (namespace,epoch,op)).fetchone()
        if old:
            if old[0] != digest:
                return {'status':'conflict'}
            return {'status':'replayed' if old[1] is not None else 'result_expired', 'effect':old[1]}
        effect = c.execute('INSERT INTO effect(namespace,epoch,op,body) VALUES (?,?,?,?)',
                           (namespace,epoch,op,body)).lastrowid
        if fault == 'before_receipt':
            os._exit(71)
        c.execute('INSERT INTO receipt VALUES (?,?,?,?,?)', (namespace,epoch,op,digest,effect))
    if fault == 'after_effect_commit':
        os._exit(72)
    return {'status':'created','effect':effect}

def expire_results(path, through, namespace='demo'):
    positive(through)
    with connection(path) as c, transaction(c):
        c.execute('UPDATE receipt SET result=NULL WHERE namespace=? AND epoch<=?', (namespace,through))

def close_and_collect(path, through, namespace='demo', fault='none'):
    positive(through)
    with connection(path) as c, transaction(c):
        row = c.execute('SELECT closed_through FROM boundary WHERE namespace=?', (namespace,)).fetchone()
        if row is None:
            raise ValueError('unknown namespace')
        if through < row[0]:
            raise ValueError('boundary cannot move backward')
        c.execute('UPDATE boundary SET closed_through=? WHERE namespace=?', (through,namespace))
        if fault == 'after_boundary':
            os._exit(73)
        c.execute('DELETE FROM receipt WHERE namespace=? AND epoch<=?', (namespace,through))
        if fault == 'before_close_commit':
            os._exit(74)
    if fault == 'after_close_commit':
        os._exit(75)

def snapshot(path):
    with connection(path) as c:
        return {'boundaries':[list(r) for r in c.execute('SELECT * FROM boundary ORDER BY namespace')],
                'receipts':c.execute('SELECT count(*) FROM receipt').fetchone()[0],
                'tombstones':c.execute('SELECT count(*) FROM receipt WHERE result IS NULL').fetchone()[0],
                'effects':c.execute('SELECT count(*) FROM effect').fetchone()[0]}

if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('path', type=Path)
    p.add_argument('action', choices=['execute','close'])
    p.add_argument('--epoch',type=int,default=1)
    p.add_argument('--op',default='work-1')
    p.add_argument('--fault',default='none')
    p.add_argument('--gate',action='store_true')
    a=p.parse_args()
    if a.gate:
        print('READY',flush=True)
        if input() != 'GO':
            raise RuntimeError('invalid gate signal')
    if a.action == 'execute':
        result=execute(a.path,a.epoch,a.op,fault=a.fault)
    else:
        close_and_collect(a.path,a.epoch,fault=a.fault)
        result={'status':'closed'}
    print(json.dumps(result),flush=True)

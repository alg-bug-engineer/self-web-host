"""Local mechanism fixture, not a network dispatcher or production SDK."""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import sqlite3


@contextmanager
def db(path):
    c = sqlite3.connect(path, timeout=10, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA synchronous=FULL')
    try:
        yield c
    finally:
        c.close()


@contextmanager
def tx(c):
    c.execute('BEGIN IMMEDIATE')
    try:
        yield c
        c.execute('COMMIT')
    except BaseException:
        if c.in_transaction:
            c.execute('ROLLBACK')
        raise


def init(root, limit=3, safety='idempotent', payload='synthetic-ticket'):
    if type(limit) is not int or limit < 0:
        raise ValueError('limit must be a nonnegative integer')
    if safety not in ('idempotent', 'non_idempotent'):
        raise ValueError('unsupported safety')
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    with db(root / 'sender.db') as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS task (
          id TEXT PRIMARY KEY, payload TEXT NOT NULL, safety TEXT NOT NULL,
          cap INTEGER NOT NULL CHECK(cap>=0), spent INTEGER NOT NULL DEFAULT 0,
          confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN (0,1)),
          CHECK(spent>=0 AND spent<=cap));
        CREATE TABLE IF NOT EXISTS reservation (
          task_id TEXT NOT NULL REFERENCES task(id), seq INTEGER NOT NULL,
          ack INTEGER NOT NULL DEFAULT 0 CHECK(ack IN (0,1)),
          PRIMARY KEY(task_id, seq));
        ''')
        with tx(c):
            old = c.execute('SELECT * FROM task WHERE id=?', ('op-1',)).fetchone()
            if old and (old['payload'], old['safety'], old['cap']) != (payload, safety, limit):
                raise ValueError('existing intent configuration conflicts')
            c.execute('INSERT OR IGNORE INTO task(id,payload,safety,cap) VALUES(?,?,?,?)',
                      ('op-1', payload, safety, limit))
    with db(root / 'sink.db') as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY, task_id TEXT, payload TEXT);
        CREATE TABLE IF NOT EXISTS effects (id INTEGER PRIMARY KEY, task_id TEXT, payload TEXT);
        CREATE TABLE IF NOT EXISTS receipt (task_id TEXT PRIMARY KEY, payload TEXT, effect_id INTEGER);
        ''')


def reserve(root, fault='none'):
    """Return a NEW reservation only. Existing rows never authorize redispatch."""
    with db(Path(root) / 'sender.db') as c, tx(c):
        row = c.execute('SELECT * FROM task WHERE id=?', ('op-1',)).fetchone()
        if row['confirmed']:
            return None, 'confirmed'
        # A prior possibly dispatched non-idempotent attempt blocks replay.
        if row['safety'] == 'non_idempotent' and row['spent']:
            return None, 'unknown_requires_reconciliation'
        if row['spent'] >= row['cap']:
            return None, 'budget_exhausted'
        seq = row['spent'] + 1
        c.execute('UPDATE task SET spent=? WHERE id=?', (seq, 'op-1'))
        c.execute('INSERT INTO reservation(task_id,seq) VALUES(?,?)', ('op-1', seq))
        if fault == 'before_reserve_commit':
            os._exit(71)
        return {'seq': seq, 'payload': row['payload'], 'safety': row['safety']}, 'reserved'


def receive(root, ticket):
    """One invocation is one visible terminal dispatch; no hidden retries."""
    with db(Path(root) / 'sink.db') as c, tx(c):
        c.execute('INSERT INTO calls(task_id,payload) VALUES(?,?)', ('op-1', ticket['payload']))
    # Instrument entry independently so a rejected business transaction remains counted.
    with db(Path(root) / 'sink.db') as c, tx(c):
        if ticket['safety'] == 'idempotent':
            old = c.execute('SELECT * FROM receipt WHERE task_id=?', ('op-1',)).fetchone()
            if old:
                if old['payload'] != ticket['payload']:
                    raise ValueError('same intent, conflicting payload')
                return old['effect_id']
        effect = c.execute('INSERT INTO effects(task_id,payload) VALUES(?,?)',
                           ('op-1', ticket['payload'])).lastrowid
        if ticket['safety'] == 'idempotent':
            c.execute('INSERT INTO receipt VALUES(?,?,?)', ('op-1', ticket['payload'], effect))
        return effect


def acknowledge(root, seq):
    with db(Path(root) / 'sender.db') as c, tx(c):
        updated = c.execute('UPDATE reservation SET ack=1 WHERE task_id=? AND seq=?',
                            ('op-1', seq)).rowcount
        if updated != 1:
            raise ValueError('unknown reservation')
        c.execute('UPDATE task SET confirmed=1 WHERE id=?', ('op-1',))


def attempt(root, fault='none', barrier=False):
    ticket, reason = reserve(root, fault)
    if ticket is None:
        return {'reason': reason}
    if fault == 'after_reserve_commit':
        os._exit(72)
    if barrier:
        print('RESERVED', flush=True)
        if input() != 'GO':
            raise ValueError('test gate not released')
    effect = receive(root, ticket)
    if fault == 'after_sink_commit':
        os._exit(73)
    acknowledge(root, ticket['seq'])
    if fault == 'after_ack_commit':
        os._exit(74)
    return {'reason': 'confirmed', 'seq': ticket['seq'], 'effect': effect}


def snapshot(root):
    with db(Path(root) / 'sender.db') as c:
        task = dict(c.execute('SELECT * FROM task').fetchone())
        reservations = [dict(r) for r in c.execute('SELECT seq,ack FROM reservation ORDER BY seq')]
    with db(Path(root) / 'sink.db') as c:
        calls = c.execute('SELECT count(*) FROM calls').fetchone()[0]
        effects = c.execute('SELECT count(*) FROM effects').fetchone()[0]
    return {'spent': task['spent'], 'cap': task['cap'], 'confirmed': bool(task['confirmed']),
            'reservations': reservations, 'receiver_calls': calls, 'effects': effects}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('root')
    p.add_argument('--fault', default='none', choices=['none', 'before_reserve_commit',
                   'after_reserve_commit', 'after_sink_commit', 'after_ack_commit'])
    p.add_argument('--start-gate', action='store_true')
    p.add_argument('--reserve-gate', action='store_true')
    args = p.parse_args()
    if args.start_gate:
        print('READY', flush=True)
        if input() != 'GO':
            raise ValueError('test gate not released')
    print(json.dumps(attempt(args.root, args.fault, args.reserve_gate)), flush=True)

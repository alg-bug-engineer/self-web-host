"""Local teaching model: durable drain barrier, NOT external-effect completion."""
import os
import sqlite3
from contextlib import contextmanager


def connect(path):
    db = sqlite3.connect(path, timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA synchronous=FULL')
    return db


def init(path):
    with connect(path) as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS control(id INTEGER PRIMARY KEY CHECK(id=1),
          mode TEXT NOT NULL CHECK(mode IN ('open','draining','paused')),
          version INTEGER NOT NULL);
        INSERT OR IGNORE INTO control VALUES(1,'open',0);
        CREATE TABLE IF NOT EXISTS task(id TEXT PRIMARY KEY, body TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('queued','inflight','quarantined','done')),
          generation INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS effect(id TEXT PRIMARY KEY REFERENCES task(id));
        ''')


def crash(point, selected):
    if point == selected:
        os._exit(73)


@contextmanager
def transaction(path, fault=None):
    db = connect(path)
    try:
        db.execute('BEGIN IMMEDIATE')
        yield db
        crash('before_commit', fault)
        db.commit()
        crash('after_commit', fault)
    finally:
        db.close()  # An uncommitted transaction rolls back on close.


def admit(path, identity, body, fault=None):
    if not isinstance(identity, str) or not identity or not isinstance(body, str):
        raise ValueError('nonempty string id and string body required')
    with transaction(path, fault) as db:
        old = db.execute('SELECT body FROM task WHERE id=?', (identity,)).fetchone()
        if old:
            return 'replay' if old['body'] == body else 'conflict'
        if db.execute('SELECT mode FROM control').fetchone()[0] != 'open':
            return 'closed'
        db.execute('INSERT INTO task(id,body,state) VALUES(?,?,?)', (identity, body, 'queued'))
        return 'accepted'


def transition(path, expected_version, action, fault=None):
    if type(expected_version) is not int or expected_version < 0:
        raise ValueError('nonnegative integer version required')
    if action not in ('drain', 'pause', 'resume'):
        raise ValueError('unknown action')
    with transaction(path, fault) as db:
        mode, version = db.execute('SELECT mode,version FROM control').fetchone()
        if version != expected_version:
            return 'stale'
        target = {'drain': 'draining', 'pause': 'paused', 'resume': 'open'}[action]
        allowed = {'drain': ('open',), 'pause': ('draining',), 'resume': ('draining', 'paused')}
        if mode not in allowed[action]:
            return 'wrong_mode'
        if action == 'pause' and db.execute("SELECT 1 FROM task WHERE state!='done' LIMIT 1").fetchone():
            return 'busy'
        db.execute('UPDATE control SET mode=?,version=? WHERE id=1', (target, version+1))
        return target


def claim(path):
    with transaction(path) as db:
        if db.execute('SELECT mode FROM control').fetchone()[0] == 'paused':
            return None
        row = db.execute("SELECT id,generation FROM task WHERE state='queued' ORDER BY id LIMIT 1").fetchone()
        if row is None:
            return None
        token = (row['id'], row['generation']+1)
        db.execute("UPDATE task SET state='inflight',generation=? WHERE id=?", (token[1], token[0]))
        return token


def finish(path, token, fault=None):
    with transaction(path, fault) as db:
        row = db.execute('SELECT state,generation FROM task WHERE id=?', (token[0],)).fetchone()
        if not row or row['state'] != 'inflight' or row['generation'] != token[1]:
            return 'stale'
        db.execute('INSERT INTO effect VALUES(?)', (token[0],))
        crash('after_effect', fault)
        db.execute("UPDATE task SET state='done' WHERE id=?", (token[0],))
        return 'done'


def quarantine(path, token):
    with transaction(path) as db:
        changed = db.execute("UPDATE task SET state='quarantined' WHERE id=? AND generation=? AND state='inflight'", token).rowcount
        return 'quarantined' if changed else 'stale'


def requeue(path, identity):
    # Trusted operator input; no authentication or automatic expiry is provided.
    with transaction(path) as db:
        changed = db.execute("UPDATE task SET state='queued' WHERE id=? AND state='quarantined'", (identity,)).rowcount
        return 'queued' if changed else 'unchanged'


def snapshot(path):
    db = connect(path)
    try:
        db.execute('BEGIN')
        mode, version = db.execute('SELECT mode,version FROM control').fetchone()
        states = {row[0]:row[1] for row in db.execute('SELECT state,count(*) FROM task GROUP BY state')}
        return {'mode':mode, 'version':version, 'states':states,
                'outstanding':sum(n for state,n in states.items() if state!='done'),
                'effects':db.execute('SELECT count(*) FROM effect').fetchone()[0]}
    finally:
        db.close()

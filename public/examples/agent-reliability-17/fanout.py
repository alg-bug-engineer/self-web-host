"""Fixed-membership durable join. Trusted synthetic inputs; no remote dispatcher."""
import json
import os
import sqlite3
from contextlib import contextmanager


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def text(value, limit=256):
    if not isinstance(value, str) or not value or len(value.encode('utf-8')) > limit:
        raise ValueError('nonempty bounded UTF-8 text required')


def connect(path):
    db = sqlite3.connect(path, isolation_level=None, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA synchronous=FULL')
    return db


def crash(point, fault):
    if point == fault:
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
        db.close()


def init(path):
    db = connect(path)
    try:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS job(
          id TEXT PRIMARY KEY, manifest TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('open','succeeded','failed')));
        CREATE TABLE IF NOT EXISTS branch(
          job_id TEXT, id TEXT, request TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('pending','unknown','ok','rejected')),
          value TEXT NOT NULL, PRIMARY KEY(job_id,id),
          FOREIGN KEY(job_id) REFERENCES job(id));
        CREATE TABLE IF NOT EXISTS receipt(
          event_id TEXT PRIMARY KEY, body TEXT NOT NULL, result TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS continuation(
          job_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL,
          consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1)),
          FOREIGN KEY(job_id) REFERENCES job(id));
        CREATE TABLE IF NOT EXISTS effect(
          job_id TEXT PRIMARY KEY, snapshot TEXT NOT NULL,
          FOREIGN KEY(job_id) REFERENCES continuation(job_id));
        ''')
    finally:
        db.close()


def normalize_manifest(manifest):
    if not isinstance(manifest, dict) or not 1 <= len(manifest) <= 32:
        raise ValueError('manifest must contain 1..32 uniquely named branches')
    for name, request in manifest.items():
        text(name); text(request, 1024)
    return canonical(manifest)


def create(path, job_id, manifest, fault=None):
    text(job_id)
    body = normalize_manifest(manifest)
    with transaction(path, fault) as db:
        old = db.execute('SELECT manifest FROM job WHERE id=?', (job_id,)).fetchone()
        if old:
            return 'replay' if old['manifest'] == body else 'conflict'
        db.execute('INSERT INTO job VALUES(?,?,?)', (job_id, body, 'open'))
        crash('after_job_insert', fault)
        for name in sorted(manifest):
            db.execute('INSERT INTO branch VALUES(?,?,?,?,?)',
                       (job_id, name, manifest[name], 'pending', ''))
            crash('after_branch_insert', fault)
        return 'created'


def expected_snapshot(db, job_id):
    rows = db.execute('SELECT id,state,value FROM branch WHERE job_id=? ORDER BY id',
                      (job_id,)).fetchall()
    return canonical([dict(row) for row in rows])


def report(path, event_id, job_id, branch_id, outcome, value='', fault=None):
    for ident in (event_id, job_id, branch_id):
        text(ident)
    if outcome not in ('unknown', 'ok', 'rejected'):
        raise ValueError('outcome must be unknown, ok or rejected')
    if not isinstance(value, str) or len(value.encode('utf-8')) > 1024:
        raise ValueError('value must be text of at most 1024 UTF-8 bytes')
    if outcome == 'unknown' and value:
        raise ValueError('unknown has no terminal value')
    body = canonical([job_id, branch_id, outcome, value])
    with transaction(path, fault) as db:
        old = db.execute('SELECT body,result FROM receipt WHERE event_id=?', (event_id,)).fetchone()
        if old:
            return {'delivery': 'replay', 'result': old['result']} if old['body'] == body else {
                'delivery': 'conflict', 'result': 'event_conflict'}
        job = db.execute('SELECT state FROM job WHERE id=?', (job_id,)).fetchone()
        row = db.execute('SELECT state,value FROM branch WHERE job_id=? AND id=?',
                         (job_id, branch_id)).fetchone()
        if not job:
            result = 'unknown_job'
        elif not row:
            result = 'unknown_branch'
        elif row['state'] in ('ok', 'rejected'):
            result = 'already_terminal' if (row['state'], row['value']) == (outcome, value) else 'terminal_conflict'
        else:
            db.execute('UPDATE branch SET state=?,value=? WHERE job_id=? AND id=?',
                       (outcome, value, job_id, branch_id))
            crash('after_branch_update', fault)
            result = 'unresolved' if outcome == 'unknown' else 'recorded'
            remaining = db.execute("SELECT COUNT(*) FROM branch WHERE job_id=? AND state IN ('pending','unknown')",
                                   (job_id,)).fetchone()[0]
            if not remaining:
                failed = db.execute("SELECT COUNT(*) FROM branch WHERE job_id=? AND state='rejected'", (job_id,)).fetchone()[0]
                db.execute('UPDATE job SET state=? WHERE id=?', ('failed' if failed else 'succeeded', job_id))
                crash('after_join_update', fault)
                db.execute('INSERT INTO continuation VALUES(?,?,0)', (job_id, expected_snapshot(db, job_id)))
                crash('after_continuation_insert', fault)
        db.execute('INSERT INTO receipt VALUES(?,?,?)', (event_id, body, result))
        crash('after_receipt_insert', fault)
        return {'delivery': 'new', 'result': result}


def consume(path, job_id, fault=None):
    text(job_id)
    with transaction(path, fault) as db:
        row = db.execute('SELECT snapshot,consumed FROM continuation WHERE job_id=?', (job_id,)).fetchone()
        if not row:
            return 'not_ready'
        if row['consumed']:
            return 'replay'
        db.execute('INSERT INTO effect VALUES(?,?)', (job_id, row['snapshot']))
        crash('after_effect_insert', fault)
        db.execute('UPDATE continuation SET consumed=1 WHERE job_id=?', (job_id,))
        crash('after_consume_update', fault)
        return 'consumed'


def inspect(path):
    db = connect(path)
    try:
        db.execute('BEGIN')
        return {table: [dict(row) for row in db.execute('SELECT * FROM '+table+' ORDER BY 1,2')]
                for table in ('job', 'branch', 'receipt', 'continuation', 'effect')}
    finally:
        db.close()


def check_invariants(path):
    db = connect(path)
    try:
        db.execute('BEGIN')
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        for job in db.execute('SELECT * FROM job').fetchall():
            rows = db.execute('SELECT * FROM branch WHERE job_id=? ORDER BY id', (job['id'],)).fetchall()
            assert {row['id']: row['request'] for row in rows} == json.loads(job['manifest'])
            unresolved = any(row['state'] in ('pending','unknown') for row in rows)
            expected = 'open' if unresolved else ('failed' if any(row['state']=='rejected' for row in rows) else 'succeeded')
            assert job['state'] == expected
            cont = db.execute('SELECT * FROM continuation WHERE job_id=?', (job['id'],)).fetchone()
            effect = db.execute('SELECT * FROM effect WHERE job_id=?', (job['id'],)).fetchone()
            if unresolved:
                assert cont is None and effect is None
            else:
                assert cont and cont['snapshot'] == expected_snapshot(db, job['id'])
                assert bool(effect) == bool(cont['consumed'])
                if effect:
                    assert effect['snapshot'] == cont['snapshot']
        return True
    finally:
        db.close()

"""Durable cooperative cancellation over trusted synthetic step receipts.

No remote dispatcher, authentication, automatic retry, clock, or worker kill.
"""
import json
import os
import sqlite3
from contextlib import contextmanager


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def text(value, limit=256):
    if not isinstance(value, str) or not value or len(value.encode('utf-8')) > limit:
        raise ValueError('nonempty bounded UTF-8 text required')


def spec(steps):
    if not isinstance(steps, list) or not 1 <= len(steps) <= 32:
        raise ValueError('steps must be a list of 1..32 request strings')
    for request in steps:
        text(request, 1024)
    return canonical(steps)


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
          id TEXT PRIMARY KEY, spec TEXT NOT NULL,
          admitted INTEGER NOT NULL CHECK(admitted IN (0,1)),
          control TEXT NOT NULL CHECK(control IN ('run','requested','acknowledged')),
          result TEXT NOT NULL CHECK(result IN ('open','succeeded','failed')));
        CREATE TABLE IF NOT EXISTS step(
          job_id TEXT, seq INTEGER NOT NULL, request TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('pending','inflight','unknown','ok','rejected')),
          value TEXT NOT NULL, PRIMARY KEY(job_id,seq),
          FOREIGN KEY(job_id) REFERENCES job(id));
        CREATE UNIQUE INDEX IF NOT EXISTS one_inflight ON step(job_id)
          WHERE state IN ('inflight','unknown');
        CREATE TABLE IF NOT EXISTS receipt(
          event_id TEXT PRIMARY KEY, body TEXT NOT NULL, result TEXT NOT NULL);
        ''')
    finally:
        db.close()


def insert_job(db, job_id, body, admitted, control, fault):
    db.execute('INSERT INTO job VALUES(?,?,?,?,?)', (job_id, body, admitted, control, 'open'))
    crash('after_job_insert', fault)
    for seq, request in enumerate(json.loads(body)):
        db.execute('INSERT INTO step VALUES(?,?,?,?,?)', (job_id, seq, request, 'pending', ''))
        crash('after_step_insert', fault)


def submit(path, job_id, steps, fault=None):
    text(job_id)
    body = spec(steps)
    with transaction(path, fault) as db:
        old = db.execute('SELECT * FROM job WHERE id=?', (job_id,)).fetchone()
        if old:
            if old['spec'] != body:
                return 'conflict'
            return 'replay' if old['admitted'] else 'blocked_cancelled'
        insert_job(db, job_id, body, 1, 'run', fault)
        return 'created'


def prior_receipt(db, event_id, body):
    old = db.execute('SELECT body,result FROM receipt WHERE event_id=?', (event_id,)).fetchone()
    if old:
        if old['body'] == body:
            return {'delivery': 'replay', 'result': old['result']}
        return {'delivery': 'conflict', 'result': 'event_conflict'}
    return None


def receipt(db, event_id, body, result, fault):
    db.execute('INSERT INTO receipt VALUES(?,?,?)', (event_id, body, result))
    crash('after_receipt_insert', fault)
    return {'delivery': 'new', 'result': result}


def request_cancel(path, event_id, job_id, steps, fault=None):
    text(event_id); text(job_id)
    manifest = spec(steps)
    body = canonical(['cancel', job_id, json.loads(manifest)])
    with transaction(path, fault) as db:
        old = prior_receipt(db, event_id, body)
        if old:
            return old
        job = db.execute('SELECT * FROM job WHERE id=?', (job_id,)).fetchone()
        if not job:
            insert_job(db, job_id, manifest, 0, 'acknowledged', fault)
            result = 'cancelled_before_submit'
        elif job['spec'] != manifest:
            result = 'spec_conflict'
        elif job['control'] == 'acknowledged':
            result = 'already_acknowledged'
        elif job['control'] == 'requested':
            result = 'already_requested'
        elif job['result'] != 'open':
            result = 'too_late'
        else:
            db.execute("UPDATE job SET control='requested' WHERE id=?", (job_id,))
            crash('after_cancel_update', fault)
            result = 'requested'
        return receipt(db, event_id, body, result, fault)


def reserve(path, job_id, fault=None):
    text(job_id)
    with transaction(path, fault) as db:
        job = db.execute('SELECT * FROM job WHERE id=?', (job_id,)).fetchone()
        if not job:
            return {'status': 'missing', 'seq': None}
        if job['control'] != 'run':
            return {'status': 'cancelled' if job['control'] == 'acknowledged' else 'cancel_requested', 'seq': None}
        if job['result'] != 'open':
            return {'status': 'terminal', 'seq': None}
        active = db.execute("SELECT seq FROM step WHERE job_id=? AND state IN ('inflight','unknown')", (job_id,)).fetchone()
        if active:
            return {'status': 'inflight', 'seq': active['seq']}
        row = db.execute("SELECT seq FROM step WHERE job_id=? AND state='pending' ORDER BY seq LIMIT 1", (job_id,)).fetchone()
        assert row is not None
        db.execute("UPDATE step SET state='inflight' WHERE job_id=? AND seq=?", (job_id,row['seq']))
        crash('after_reserve_update', fault)
        return {'status': 'reserved', 'seq': row['seq']}


def report(path, event_id, job_id, seq, outcome, value='', fault=None):
    text(event_id); text(job_id)
    if type(seq) is not int or not 0 <= seq < 32:
        raise ValueError('seq must be an integer in 0..31')
    if outcome not in ('unknown','ok','rejected'):
        raise ValueError('unknown, ok or rejected required')
    if not isinstance(value, str) or len(value.encode('utf-8')) > 1024 or (outcome == 'unknown' and value):
        raise ValueError('bounded result text; unknown must be empty')
    body = canonical(['report', job_id, seq, outcome, value])
    with transaction(path, fault) as db:
        old = prior_receipt(db, event_id, body)
        if old:
            return old
        job = db.execute('SELECT * FROM job WHERE id=?', (job_id,)).fetchone()
        row = db.execute('SELECT * FROM step WHERE job_id=? AND seq=?', (job_id,seq)).fetchone()
        if not job:
            result = 'unknown_job'
        elif not row:
            result = 'unknown_step'
        elif row['state'] == 'pending':
            result = 'not_reserved'
        elif row['state'] in ('ok','rejected'):
            result = 'already_settled' if (row['state'],row['value']) == (outcome,value) else 'terminal_conflict'
        else:
            db.execute('UPDATE step SET state=?,value=? WHERE job_id=? AND seq=?', (outcome,value,job_id,seq))
            crash('after_step_update', fault)
            states = [r[0] for r in db.execute('SELECT state FROM step WHERE job_id=?', (job_id,))]
            final = 'failed' if 'rejected' in states else ('succeeded' if all(s == 'ok' for s in states) else 'open')
            db.execute('UPDATE job SET result=? WHERE id=?', (final,job_id))
            crash('after_result_update', fault)
            result = 'unresolved' if outcome == 'unknown' else 'recorded'
        return receipt(db,event_id,body,result,fault)


def checkpoint(path, job_id, fault=None):
    text(job_id)
    with transaction(path, fault) as db:
        job = db.execute('SELECT * FROM job WHERE id=?', (job_id,)).fetchone()
        if not job:
            return 'missing'
        if job['control'] == 'run':
            return 'not_requested'
        if job['control'] == 'acknowledged':
            return 'replay'
        active = db.execute("SELECT 1 FROM step WHERE job_id=? AND state IN ('inflight','unknown')", (job_id,)).fetchone()
        if active:
            return 'inflight'
        db.execute("UPDATE job SET control='acknowledged' WHERE id=?", (job_id,))
        crash('after_ack_update', fault)
        return 'acknowledged'


def inspect(path):
    db = connect(path)
    try:
        db.execute('BEGIN')
        return {table: [dict(row) for row in db.execute('SELECT * FROM '+table+' ORDER BY 1,2')]
                for table in ('job','step','receipt')}
    finally:
        db.close()


def check_invariants(path):
    db = connect(path)
    try:
        db.execute('BEGIN')
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        for job in db.execute('SELECT * FROM job').fetchall():
            steps = db.execute('SELECT * FROM step WHERE job_id=? ORDER BY seq', (job['id'],)).fetchall()
            assert [s['seq'] for s in steps] == list(range(len(steps)))
            assert [s['request'] for s in steps] == json.loads(job['spec'])
            states = [s['state'] for s in steps]
            active = sum(s in ('inflight','unknown') for s in states)
            assert active <= 1
            prefix = 0
            while prefix < len(states) and states[prefix] == 'ok':
                prefix += 1
            assert all(s == 'pending' for s in states[prefix+1:])
            assert all(s['value'] == '' for s in steps if s['state'] in ('pending','inflight','unknown'))
            expected = 'failed' if 'rejected' in states else ('succeeded' if prefix == len(states) else 'open')
            assert job['result'] == expected
            if job['control'] == 'acknowledged':
                assert active == 0
            if not job['admitted']:
                assert job['control'] == 'acknowledged' and all(s == 'pending' for s in states)
        return True
    finally:
        db.close()

"""Durable admission teaching model. Local synthetic effects, NOT remote execution."""
import contextlib
import json
import os
import re
import sqlite3

ACTIVE = "('queued','inflight','quarantined')"
DEFAULT = dict(global_slots=4, global_bytes=256, tenant_slots=2,
               tenant_bytes=128, max_payload=96)


def ident(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value):
        raise ValueError('identifier must be 1..64 ASCII letters/digits/_/-')
    return value


def integer(value):
    if type(value) is not int or not 0 <= value <= 10**9:
        raise ValueError('expected integer in 0..1e9')
    return value


def crash(point, requested):
    if point == requested:
        os._exit(73)


@contextlib.contextmanager
def tx(path, write=True):
    con = sqlite3.connect(path, timeout=20, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys=ON')
    con.execute('PRAGMA synchronous=FULL')
    try:
        con.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
        yield con
        con.commit()
    except BaseException:
        con.rollback()
        raise
    finally:
        con.close()


def init(path, limits=None):
    limits = DEFAULT.copy() if limits is None else dict(limits)
    if set(limits) != set(DEFAULT) or any(integer(v) == 0 for v in limits.values()):
        raise ValueError('all five positive limits required')
    encoded = json.dumps(limits, sort_keys=True)
    con = sqlite3.connect(path)
    con.execute('PRAGMA journal_mode=WAL')
    con.close()
    with tx(path) as con:
        for statement in [
            'CREATE TABLE IF NOT EXISTS config (id INTEGER PRIMARY KEY CHECK(id=1), limits TEXT NOT NULL)',
            'CREATE TABLE IF NOT EXISTS clock (id INTEGER PRIMARY KEY CHECK(id=1), tick INTEGER NOT NULL)',
            '''CREATE TABLE IF NOT EXISTS intent (
                 id TEXT PRIMARY KEY, tenant TEXT NOT NULL, payload TEXT NOT NULL,
                 nbytes INTEGER NOT NULL CHECK(nbytes>0))''',
            '''CREATE TABLE IF NOT EXISTS task (
                 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE REFERENCES intent(id),
                 state TEXT NOT NULL CHECK(state IN ('queued','inflight','quarantined','done','cancelled')),
                 generation INTEGER NOT NULL DEFAULT 0, lease INTEGER NOT NULL DEFAULT 0)''',
            '''CREATE TABLE IF NOT EXISTS effect (
                 id TEXT PRIMARY KEY REFERENCES intent(id), value TEXT NOT NULL)''',
            'CREATE INDEX IF NOT EXISTS task_state ON task(state)',
            'CREATE INDEX IF NOT EXISTS intent_tenant ON intent(tenant)']:
            con.execute(statement)
        old = con.execute('SELECT limits FROM config WHERE id=1').fetchone()
        if old and old[0] != encoded:
            raise ValueError('persisted limits differ; migration not implemented')
        con.execute('INSERT OR IGNORE INTO config VALUES(1,?)', (encoded,))
        con.execute('INSERT OR IGNORE INTO clock VALUES(1,0)')


def usage(con, tenant=None):
    sql = f'SELECT COUNT(*), COALESCE(SUM(i.nbytes),0) FROM task t JOIN intent i USING(id) WHERE t.state IN {ACTIVE}'
    args = ()
    if tenant is not None:
        sql += ' AND i.tenant=?'
        args = (tenant,)
    return tuple(con.execute(sql, args).fetchone())


def admit(path, request_id, tenant, payload, fault=None):
    ident(request_id); ident(tenant)
    if not isinstance(payload, str) or not payload:
        raise ValueError('nonempty UTF-8 text required')
    size = len(payload.encode('utf-8', errors='strict'))
    with tx(path) as con:
        old = con.execute('SELECT tenant,payload FROM intent WHERE id=?', (request_id,)).fetchone()
        if old:
            return 'replay' if tuple(old) == (tenant, payload) else 'conflict'
        limits = json.loads(con.execute('SELECT limits FROM config').fetchone()[0])
        if size > limits['max_payload']:
            return 'oversize'
        for scope, owner in [('global', None), ('tenant', tenant)]:
            count, nbytes = usage(con, owner)
            if count + 1 > limits[scope + '_slots'] or nbytes + size > limits[scope + '_bytes']:
                return scope + '_full'
        con.execute('INSERT INTO intent VALUES(?,?,?,?)', (request_id, tenant, payload, size))
        crash('between_intent_task', fault)
        con.execute("INSERT INTO task(id,state) VALUES(?,'queued')", (request_id,))
        crash('before_admit_commit', fault)
    crash('after_admit_commit', fault)
    return 'accepted'


def advance(con, now):
    integer(now)
    previous = con.execute('SELECT tick FROM clock').fetchone()[0]
    if now < previous:
        raise ValueError('logical clock cannot go backwards')
    con.execute('UPDATE clock SET tick=?', (now,))


def claim(path, now):
    with tx(path) as con:
        advance(con, now)
        row = con.execute("SELECT * FROM task WHERE state='queued' OR (state='inflight' AND lease<=?) ORDER BY seq LIMIT 1", (now,)).fetchone()
        if row is None:
            return None
        generation = row['generation'] + 1
        con.execute("UPDATE task SET state='inflight',generation=?,lease=? WHERE id=?", (generation, now + 5, row['id']))
        return dict(id=row['id'], generation=generation)


def resolve(path, token, now, quarantine=False, fault=None):
    """Trusted worker applies ONLY this database's synthetic effect atomically."""
    ident(token['id']); integer(token['generation'])
    if type(quarantine) is not bool:
        raise ValueError('quarantine must be bool')
    with tx(path) as con:
        advance(con, now)
        row = con.execute('SELECT * FROM task WHERE id=?', (token['id'],)).fetchone()
        if not row or row['state'] != 'inflight' or row['generation'] != token['generation'] or row['lease'] <= now:
            return 'stale'
        if quarantine:
            con.execute("UPDATE task SET state='quarantined' WHERE id=?", (token['id'],))
        else:
            con.execute("INSERT INTO effect VALUES(?,'synthetic-completed')", (token['id'],))
            crash('between_effect_done', fault)
            con.execute("UPDATE task SET state='done' WHERE id=?", (token['id'],))
        crash('before_resolve_commit', fault)
    crash('after_resolve_commit', fault)
    return 'quarantined' if quarantine else 'done'


def cancel_unstarted(path, request_id, fault=None):
    ident(request_id)
    with tx(path) as con:
        cur = con.execute("UPDATE task SET state='cancelled' WHERE id=? AND state='queued' AND generation=0", (request_id,))
        if cur.rowcount != 1:
            return 'not_cancelled'
        crash('before_cancel_commit', fault)
    crash('after_cancel_commit', fault)
    return 'cancelled'


def redrive(path, request_id, expected_generation):
    """Explicit operator action; retains capacity and identity, no new admission."""
    ident(request_id); integer(expected_generation)
    with tx(path) as con:
        cur = con.execute("UPDATE task SET state='queued',generation=generation+1 WHERE id=? AND state='quarantined' AND generation=?", (request_id, expected_generation))
        return 'redriven' if cur.rowcount else 'stale'


def snapshot(path):
    with tx(path, False) as con:
        return dict(usage=list(usage(con)),
                    intents=con.execute('SELECT COUNT(*) FROM intent').fetchone()[0],
                    effects=con.execute('SELECT COUNT(*) FROM effect').fetchone()[0],
                    tasks=[dict(r) for r in con.execute('SELECT id,state,generation,lease FROM task ORDER BY seq')])

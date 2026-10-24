"""Durable local signal/timeout teaching protocol. Trusted inputs; no remote effects."""
import json
import os
import sqlite3
from contextlib import contextmanager


def connect(path):
    db = sqlite3.connect(path, isolation_level=None, timeout=20)
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


def text(value):
    if not isinstance(value, str) or not value or len(value.encode('utf-8')) > 256:
        raise ValueError('nonempty text, at most 256 UTF-8 bytes')


def integer(value):
    if type(value) is not int or not 0 <= value <= 2**62:
        raise ValueError('bounded nonnegative integer required')


def init(path):
    db = connect(path)
    try:
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS clock(id INTEGER PRIMARY KEY CHECK(id=1), tick INTEGER NOT NULL);
        INSERT OR IGNORE INTO clock VALUES(1,0);
        CREATE TABLE IF NOT EXISTS slot(flow TEXT, step TEXT, generation INTEGER NOT NULL,
          PRIMARY KEY(flow,step));
        CREATE TABLE IF NOT EXISTS waiting(flow TEXT,step TEXT,generation INTEGER,deadline INTEGER,
          state TEXT NOT NULL CHECK(state IN ('waiting','signaled','timed_out')),event_id TEXT,
          PRIMARY KEY(flow,step,generation));
        CREATE TABLE IF NOT EXISTS receipt(event_id TEXT PRIMARY KEY,body TEXT NOT NULL,result TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS continuation(flow TEXT,step TEXT,generation INTEGER,kind TEXT,value TEXT,
          consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1)),
          PRIMARY KEY(flow,step,generation),
          FOREIGN KEY(flow,step,generation) REFERENCES waiting(flow,step,generation));
        CREATE TABLE IF NOT EXISTS effect(flow TEXT,step TEXT,generation INTEGER,kind TEXT,value TEXT,
          PRIMARY KEY(flow,step,generation),
          FOREIGN KEY(flow,step,generation) REFERENCES continuation(flow,step,generation));
        ''')
    finally:
        db.close()


def advance(db, now):
    tick = max(now, db.execute('SELECT tick FROM clock WHERE id=1').fetchone()[0])
    db.execute('UPDATE clock SET tick=? WHERE id=1', (tick,))
    return tick


def open_wait(path, flow, step, expected_generation, deadline, now, fault=None):
    text(flow); text(step); integer(expected_generation); integer(deadline); integer(now)
    with transaction(path, fault) as db:
        tick = advance(db, now)
        slot = db.execute('SELECT generation FROM slot WHERE flow=? AND step=?', (flow,step)).fetchone()
        current = slot[0] if slot else 0
        if current != expected_generation:
            return {'result':'stale', 'generation':current}
        if deadline <= tick:
            return {'result':'expired', 'generation':current}
        if current:
            old = db.execute('SELECT state FROM waiting WHERE flow=? AND step=? AND generation=?',
                             (flow,step,current)).fetchone()
            if old[0] == 'waiting':
                return {'result':'busy', 'generation':current}
            pending = db.execute('SELECT consumed FROM continuation WHERE flow=? AND step=? AND generation=?',
                                 (flow,step,current)).fetchone()
            if not pending[0]:
                return {'result':'pending_continuation', 'generation':current}
        gen = current + 1
        db.execute('INSERT INTO slot VALUES(?,?,?) ON CONFLICT(flow,step) DO UPDATE SET generation=excluded.generation',
                   (flow,step,gen))
        db.execute('INSERT INTO waiting VALUES(?,?,?,?,?,NULL)', (flow,step,gen,deadline,'waiting'))
        crash('after_wait_insert', fault)
        return {'result':'opened','generation':gen}


def finish(db, flow, step, gen, kind, value, event_id, fault):
    db.execute('UPDATE waiting SET state=?,event_id=? WHERE flow=? AND step=? AND generation=?',
               (kind,event_id,flow,step,gen))
    crash('after_terminal_update',fault)
    db.execute('INSERT INTO continuation(flow,step,generation,kind,value) VALUES(?,?,?,?,?)',
               (flow,step,gen,kind,value))
    crash('after_continuation_insert',fault)


def signal(path, event_id, flow, step, generation, value, now, fault=None):
    for v in (event_id,flow,step,value): text(v)
    integer(generation); integer(now)
    if generation == 0: raise ValueError('positive generation required')
    # Observation time is not message identity. A retry may arrive later.
    body = json.dumps([flow,step,generation,value],ensure_ascii=False,separators=(',',':'))
    with transaction(path,fault) as db:
        old = db.execute('SELECT body,result FROM receipt WHERE event_id=?',(event_id,)).fetchone()
        if old:
            return {'result':'replay','original':old['result']} if old['body']==body else {'result':'conflict'}
        tick = advance(db,now)
        w = db.execute('SELECT * FROM waiting WHERE flow=? AND step=? AND generation=?',
                       (flow,step,generation)).fetchone()
        current = db.execute('SELECT generation FROM slot WHERE flow=? AND step=?',(flow,step)).fetchone()
        if not w:
            result='unknown_wait'
        elif not current or current[0] != generation:
            result='stale_generation'
        elif w['state'] != 'waiting':
            result='closed'
        elif tick >= w['deadline']:
            finish(db,flow,step,generation,'timed_out','deadline',None,fault)
            result='too_late'
        else:
            finish(db,flow,step,generation,'signaled',value,event_id,fault)
            result='accepted'
        db.execute('INSERT INTO receipt VALUES(?,?,?)',(event_id,body,result))
        crash('after_receipt_insert',fault)
        return {'result':result}


def expire(path,flow,step,generation,now,fault=None):
    text(flow); text(step); integer(generation); integer(now)
    if generation == 0: raise ValueError('positive generation required')
    with transaction(path,fault) as db:
        tick=advance(db,now)
        current=db.execute('SELECT generation FROM slot WHERE flow=? AND step=?',(flow,step)).fetchone()
        if not current or current[0] != generation:
            return 'stale_generation'
        w=db.execute('SELECT * FROM waiting WHERE flow=? AND step=? AND generation=?',
                     (flow,step,generation)).fetchone()
        if w['state'] != 'waiting': return 'closed'
        if tick < w['deadline']: return 'not_due'
        finish(db,flow,step,generation,'timed_out','deadline',None,fault)
        return 'expired'


def resume(path,flow,step,generation,fault=None):
    text(flow); text(step); integer(generation)
    if generation == 0: raise ValueError('positive generation required')
    with transaction(path,fault) as db:
        c=db.execute('SELECT * FROM continuation WHERE flow=? AND step=? AND generation=?',
                     (flow,step,generation)).fetchone()
        if not c: return 'not_ready'
        if c['consumed']: return 'replay'
        db.execute('INSERT INTO effect VALUES(?,?,?,?,?)',
                   (flow,step,generation,c['kind'],c['value']))
        crash('after_effect_insert',fault)
        db.execute('UPDATE continuation SET consumed=1 WHERE flow=? AND step=? AND generation=?',
                   (flow,step,generation))
        return 'resumed'


def snapshot(path):
    db=connect(path)
    try:
        db.execute('BEGIN')
        return {table:[dict(r) for r in db.execute('SELECT * FROM '+table+' ORDER BY rowid')]
                for table in ('clock','slot','waiting','receipt','continuation','effect')}
    finally:
        db.close()


def check_invariants(path):
    s=snapshot(path)
    waits={(w['flow'],w['step'],w['generation']):w for w in s['waiting']}
    cont={(c['flow'],c['step'],c['generation']):c for c in s['continuation']}
    eff={(e['flow'],e['step'],e['generation']):e for e in s['effect']}
    receipts={r['event_id']:r for r in s['receipt']}
    for key,w in waits.items():
        assert (key in cont)==(w['state']!='waiting')
        if key in cont:
            c=cont[key]
            assert c['kind']==w['state']
            assert bool(c['consumed'])==(key in eff)
            if key in eff: assert (eff[key]['kind'],eff[key]['value'])==(c['kind'],c['value'])
            if w['state']=='signaled':
                r=receipts[w['event_id']]
                assert r['result']=='accepted'
                assert json.loads(r['body'])==[*key,c['value']]
            else: assert w['event_id'] is None and c['value']=='deadline'
    assert set(cont)<=set(waits) and set(eff)<=set(cont)
    for slot in s['slot']:
        key=(slot['flow'],slot['step'])
        gens=sorted(k[2] for k in waits if k[:2]==key)
        assert gens==list(range(1,slot['generation']+1))
        for gen in gens[:-1]: assert cont[(*key,gen)]['consumed']==1
    return True

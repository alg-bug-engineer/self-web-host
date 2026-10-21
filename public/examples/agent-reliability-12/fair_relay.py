"""Trusted-input, local SQLite scheduling experiment; not a network worker service."""
import json
import os
import re
import sqlite3
from contextlib import contextmanager
from pathlib import Path

LIMIT = 3
LEASE = 5
MAX_INT = 2**63 - 100


def crash(point, chosen):
    if point == chosen:
        os._exit(73)


def integer(value, minimum=0):
    if type(value) is not int or not minimum <= value <= MAX_INT:
        raise ValueError('bounded integer required')
    return value


def name(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value):
        raise ValueError('identifier required')
    return value


@contextmanager
def db(root, filename, write=False):
    c = sqlite3.connect(Path(root) / filename, timeout=20, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA synchronous=FULL')
    try:
        c.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
        yield c
        c.commit()
    except BaseException:
        c.rollback()
        raise
    finally:
        c.close()


def init(root):
    Path(root).mkdir(parents=True, exist_ok=True)
    schemas = {
      'queue.db': '''
        CREATE TABLE IF NOT EXISTS clock(id INTEGER PRIMARY KEY CHECK(id=1), tick INTEGER NOT NULL, ticket INTEGER NOT NULL);
        INSERT OR IGNORE INTO clock VALUES(1,0,0);
        CREATE TABLE IF NOT EXISTS flow(flow_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, served INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS event(event_id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, seq INTEGER NOT NULL,
          body TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('ready','inflight','quarantined','acked')),
          next_at INTEGER NOT NULL, lease_until INTEGER NOT NULL, generation INTEGER NOT NULL,
          attempts INTEGER NOT NULL, lifetime_attempts INTEGER NOT NULL, reason TEXT,
          UNIQUE(flow_id,seq));
        CREATE TABLE IF NOT EXISTS audit(n INTEGER PRIMARY KEY, event_id TEXT NOT NULL, generation INTEGER NOT NULL, reason TEXT NOT NULL);
      ''',
      'receiver.db': '''
        CREATE TABLE IF NOT EXISTS receipt(event_id TEXT PRIMARY KEY, flow_id TEXT NOT NULL, seq INTEGER NOT NULL, body TEXT NOT NULL, UNIQUE(flow_id,seq));
        CREATE TABLE IF NOT EXISTS projection(flow_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, total INTEGER NOT NULL);
      '''}
    for filename, sql in schemas.items():
        c = sqlite3.connect(Path(root) / filename)
        try:
            c.execute('PRAGMA journal_mode=WAL')
            c.execute('PRAGMA synchronous=FULL')
            c.executescript(sql)
        finally:
            c.close()


def tick(c, now):
    integer(now)
    old = c.execute('SELECT tick FROM clock WHERE id=1').fetchone()[0]
    if now < old:
        raise ValueError('logical time must not move backwards')
    c.execute('UPDATE clock SET tick=? WHERE id=1', (now,))


def enqueue(root, event_id, flow_id, delta=1):
    name(event_id); name(flow_id); integer(delta, 1)
    if delta > 1000:
        raise ValueError('delta above example bound')
    with db(root, 'queue.db', True) as c:
        old = c.execute('SELECT * FROM event WHERE event_id=?', (event_id,)).fetchone()
        if old:
            body = json.loads(old['body'])
            return 'existing' if body['flow_id'] == flow_id and body['delta'] == delta else 'conflict'
        c.execute('INSERT OR IGNORE INTO flow VALUES(?,0,0)', (flow_id,))
        seq = c.execute('SELECT seq FROM flow WHERE flow_id=?', (flow_id,)).fetchone()[0] + 1
        integer(seq, 1)
        body = json.dumps(dict(event_id=event_id, flow_id=flow_id, seq=seq, delta=delta), sort_keys=True, separators=(',', ':'))
        c.execute("INSERT INTO event VALUES(?,?,?,?,'ready',0,0,0,0,0,NULL)", (event_id,flow_id,seq,body))
        c.execute('UPDATE flow SET seq=? WHERE flow_id=?', (seq,flow_id))
    return 'queued'


HEADS = '''SELECT e.*,f.served FROM event e JOIN flow f USING(flow_id)
    WHERE e.state != 'acked' AND NOT EXISTS
      (SELECT 1 FROM event p WHERE p.flow_id=e.flow_id AND p.seq<e.seq AND p.state!='acked')'''


def claim(root, now, fault=None):
    """Reserve at most one eligible flow head; durable fair-opportunity ticket."""
    with db(root, 'queue.db', True) as c:
        tick(c, now)
        heads = c.execute(HEADS + ' ORDER BY f.served,e.flow_id').fetchall()
        picked = None
        for e in heads:
            due = (e['state'] == 'ready' and e['next_at'] <= now) or (e['state'] == 'inflight' and e['lease_until'] <= now)
            if not due:
                continue
            if e['attempts'] >= LIMIT:
                # No transport result is inferred. Budget exhaustion is not a delivery failure proof.
                c.execute("UPDATE event SET state='quarantined',reason='attempt_budget',generation=generation+1 WHERE event_id=?", (e['event_id'],))
                continue
            picked = e
            break
        if picked:
            serial = c.execute('SELECT ticket FROM clock WHERE id=1').fetchone()[0] + 1
            integer(serial, 1)
            c.execute('UPDATE clock SET ticket=? WHERE id=1', (serial,))
            c.execute('UPDATE flow SET served=? WHERE flow_id=?', (serial,picked['flow_id']))
            c.execute("UPDATE event SET state='inflight',generation=generation+1,attempts=attempts+1,lifetime_attempts=lifetime_attempts+1,lease_until=?,reason=NULL WHERE event_id=?", (now+LEASE,picked['event_id']))
            row = dict(c.execute('SELECT * FROM event WHERE event_id=?',(picked['event_id'],)).fetchone())
        else:
            row = None
        crash('claim_before_commit', fault)
    crash('claim_after_commit', fault)
    return row


def receive(root, body, fault=None, max_delta=1000):
    """Trusted canonical body; receipt and synthetic local effect share one transaction."""
    e = json.loads(body)
    if set(e) != {'event_id','flow_id','seq','delta'}:
        raise ValueError('event fields')
    name(e['event_id']); name(e['flow_id']); integer(e['seq'],1); integer(e['delta'],1)
    if e['delta'] > 1000:
        raise ValueError('delta above example bound')
    with db(root,'receiver.db',True) as c:
        old = c.execute('SELECT body FROM receipt WHERE event_id=?',(e['event_id'],)).fetchone()
        if old:
            return 'duplicate' if old[0] == body else 'id_conflict'
        other = c.execute('SELECT 1 FROM receipt WHERE flow_id=? AND seq=?',(e['flow_id'],e['seq'])).fetchone()
        if other:
            return 'sequence_conflict'
        previous = c.execute('SELECT * FROM projection WHERE flow_id=?',(e['flow_id'],)).fetchone()
        seq, total = (previous['seq'], previous['total']) if previous else (0,0)
        if e['seq'] != seq+1:
            return 'gap'
        if e['delta'] > max_delta:
            return 'unsupported_delta'
        integer(total+e['delta'])
        c.execute('INSERT INTO receipt VALUES(?,?,?,?)',(e['event_id'],e['flow_id'],e['seq'],body))
        c.execute('INSERT INTO projection VALUES(?,?,?) ON CONFLICT(flow_id) DO UPDATE SET seq=excluded.seq,total=excluded.total',(e['flow_id'],e['seq'],total+e['delta']))
        crash('receive_before_commit',fault)
    crash('receive_after_commit',fault)
    return 'accepted'


def settle(root, token, result, now, fault=None):
    if result not in {'accepted','duplicate','retry','gap','id_conflict','sequence_conflict','unsupported_delta'}:
        raise ValueError('unknown transport result')
    with db(root,'queue.db',True) as c:
        tick(c,now)
        e = c.execute('SELECT * FROM event WHERE event_id=?',(token['event_id'],)).fetchone()
        if not e or e['state']!='inflight' or e['generation']!=token['generation']:
            return 'stale'
        # Expired but not yet reclaimed also cannot settle; expiry is a strict local write fence.
        if now >= e['lease_until']:
            return 'expired'
        if result in {'accepted','duplicate'}:
            state, reason, next_at = 'acked', None, e['next_at']
        elif result in {'id_conflict','sequence_conflict','unsupported_delta'} or e['attempts']>=LIMIT:
            state, reason, next_at = 'quarantined', result if result not in {'retry','gap'} else 'attempt_budget',e['next_at']
        else:
            state, reason, next_at = 'ready',result,now+min(2**e['attempts'],8)
        c.execute('UPDATE event SET state=?,reason=?,next_at=? WHERE event_id=?',(state,reason,next_at,e['event_id']))
        crash('settle_before_commit',fault)
    crash('settle_after_commit',fault)
    return state


def redrive(root, event_id, expected_generation, reason, now):
    """Explicit trusted operator decision, NOT authorization/authentication implementation."""
    name(event_id); integer(expected_generation)
    if not isinstance(reason,str) or not reason.strip() or len(reason)>200:
        raise ValueError('nonempty bounded decision reason required')
    with db(root,'queue.db',True) as c:
        tick(c,now)
        e = c.execute('SELECT * FROM event WHERE event_id=?',(event_id,)).fetchone()
        if not e or e['state']!='quarantined' or e['generation']!=expected_generation:
            return 'stale'
        generation=e['generation']+1
        c.execute("UPDATE event SET state='ready',next_at=?,lease_until=0,generation=?,attempts=0,reason=NULL WHERE event_id=?",(now,generation,event_id))
        c.execute('INSERT INTO audit(event_id,generation,reason) VALUES(?,?,?)',(event_id,generation,reason))
    return 'ready'


def step(root, now, transport='normal', max_delta=1000, fault=None):
    token=claim(root,now,fault)
    if token is None:
        return {'event':None,'result':'idle'}
    result='retry' if transport=='unavailable' else receive(root,token['body'],fault,max_delta)
    final=settle(root,token,result,now,fault)
    return {'event':token['event_id'],'result':result,'state':final}


def snapshot(root):
    # Call after workers have exited. Two independent reads are not a distributed snapshot.
    answer={}
    for filename,tables in [('queue.db',['clock','flow','event','audit']),('receiver.db',['receipt','projection'])]:
        with db(root,filename) as c:
            for table in tables:
                order={'event':'flow_id,seq','receipt':'flow_id,seq','flow':'flow_id','projection':'flow_id','clock':'id','audit':'n'}[table]
                answer[table]=[dict(row) for row in c.execute(f'SELECT * FROM {table} ORDER BY {order}')]
    return answer

"""Synthetic ordered local effects; no network, model, broker, or authorization."""
import json
import os
import re
import sqlite3
from contextlib import closing, contextmanager
from pathlib import Path

MAX_SEQ = 2**63 - 1
NEXT = {'new': 'reserved', 'reserved': 'confirmed', 'confirmed': 'released'}
FIELDS = {'event_id', 'flow_id', 'seq', 'kind', 'schema', 'payload'}


def connect(path):
    c = sqlite3.connect(path, timeout=20, isolation_level=None)
    c.execute('PRAGMA synchronous=FULL')
    return c


@contextmanager
def tx(path):
    with closing(connect(path)) as c:
        c.execute('BEGIN IMMEDIATE')
        try:
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise


def crash(point, fault):
    if point == fault:
        os._exit(73)


def key(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}', value):
        raise ValueError('ID must be 1..100 ASCII identifier characters')


def integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError('integer outside contract')


def canonical(event):
    """Validate only the transport envelope. Unknown schema/payload stays inspectable."""
    if not isinstance(event, dict) or set(event) != FIELDS:
        raise ValueError('invalid envelope fields')
    key(event['event_id']); key(event['flow_id']); key(event['kind'])
    integer(event['seq'], 1, MAX_SEQ); integer(event['schema'], 1, 1000)
    p = event['payload']
    if not isinstance(p, dict) or len(p) > 10:
        raise ValueError('payload must be a small flat object')
    for name, value in p.items():
        key(name)
        if type(value) not in (str, int, bool, type(None)):
            raise ValueError('only bounded scalar payload fields are supported')
        if type(value) is str and len(value) > 100:
            raise ValueError('payload string too long')
        if type(value) is int:
            integer(value, -MAX_SEQ, MAX_SEQ)
    return json.dumps(event, ensure_ascii=True, sort_keys=True, separators=(',', ':'))


def init(root):
    root = Path(root); root.mkdir(parents=True, exist_ok=True)
    schemas = {
        'producer.db': '''
            CREATE TABLE IF NOT EXISTS flow(
                flow_id TEXT PRIMARY KEY, seq INTEGER NOT NULL,
                state TEXT NOT NULL, amount INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS outbox(
                event_id TEXT PRIMARY KEY, flow_id TEXT NOT NULL,
                seq INTEGER NOT NULL, body TEXT NOT NULL,
                accepted INTEGER NOT NULL DEFAULT 0 CHECK(accepted IN (0,1)),
                UNIQUE(flow_id,seq));''',
        'consumer.db': '''
            CREATE TABLE IF NOT EXISTS inbox(
                event_id TEXT PRIMARY KEY, flow_id TEXT NOT NULL,
                seq INTEGER NOT NULL, body TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending'
                    CHECK(state IN ('pending','blocked','applied')),
                reason TEXT, UNIQUE(flow_id,seq));
            CREATE TABLE IF NOT EXISTS projection(
                flow_id TEXT PRIMARY KEY, last_seq INTEGER NOT NULL,
                state TEXT NOT NULL, amount INTEGER NOT NULL,
                held INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS effect(
                event_id TEXT PRIMARY KEY, flow_id TEXT NOT NULL,
                seq INTEGER NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL,
                UNIQUE(flow_id,seq));'''
    }
    for filename, sql in schemas.items():
        with closing(connect(root/filename)) as c:
            c.execute('PRAGMA journal_mode=WAL'); c.executescript(sql)


def advance(root, event_id, flow_id, expected_seq, kind, amount=3, schema=1, fault=None):
    """Producer state and its immutable event share one transaction."""
    key(event_id); key(flow_id); key(kind)
    integer(expected_seq, 0, MAX_SEQ-1); integer(amount, 1, 1000000)
    integer(schema, 1, 2)
    event = {'event_id': event_id, 'flow_id': flow_id, 'seq': expected_seq+1,
             'kind': kind, 'schema': schema,
             'payload': {'amount' if schema == 1 else 'units': amount}}
    body = canonical(event)
    with tx(Path(root)/'producer.db') as c:
        old = c.execute('SELECT body FROM outbox WHERE event_id=?', (event_id,)).fetchone()
        if old:
            return 'existing' if old[0] == body else 'conflict'
        old = c.execute('SELECT seq,state,amount FROM flow WHERE flow_id=?', (flow_id,)).fetchone()
        seq, state, fixed_amount = old if old else (0, 'new', amount)
        if seq != expected_seq:
            return 'stale'
        if kind != NEXT.get(state) or amount != fixed_amount:
            return 'invalid_transition'
        c.execute('INSERT INTO flow VALUES(?,?,?,?) ON CONFLICT(flow_id) DO UPDATE '
                  'SET seq=excluded.seq,state=excluded.state', (flow_id, seq+1, kind, amount))
        crash('producer_after_state', fault)
        c.execute('INSERT INTO outbox(event_id,flow_id,seq,body) VALUES(?,?,?,?)',
                  (event_id, flow_id, seq+1, body))
        crash('producer_before_commit', fault)
    crash('producer_after_commit', fault)
    return 'committed'


def events(root):
    with closing(connect(Path(root)/'producer.db')) as c:
        return [json.loads(r[0]) for r in c.execute('SELECT body FROM outbox ORDER BY flow_id,seq')]


def receive(root, event, fault=None):
    """ACK is durable custody only; application happens in apply_next."""
    body = canonical(event)
    with tx(Path(root)/'consumer.db') as c:
        old = c.execute('SELECT body FROM inbox WHERE event_id=?', (event['event_id'],)).fetchone()
        if old:
            return 'duplicate' if old[0] == body else 'id_conflict'
        old = c.execute('SELECT event_id FROM inbox WHERE flow_id=? AND seq=?',
                        (event['flow_id'], event['seq'])).fetchone()
        if old:
            return 'sequence_conflict'
        c.execute('INSERT INTO inbox(event_id,flow_id,seq,body) VALUES(?,?,?,?)',
                  (event['event_id'], event['flow_id'], event['seq'], body))
        crash('receive_before_commit', fault)
    crash('receive_after_commit', fault)
    return 'accepted'


def relay(root, event_id=None, fault=None):
    """No lease: concurrent relays may send the same immutable event."""
    root = Path(root)
    with closing(connect(root/'producer.db')) as c:
        if event_id is None:
            row = c.execute('SELECT event_id,body FROM outbox WHERE accepted=0 '
                            'ORDER BY flow_id,seq LIMIT 1').fetchone()
        else:
            key(event_id)
            row = c.execute('SELECT event_id,body FROM outbox WHERE event_id=? AND accepted=0',
                            (event_id,)).fetchone()
    if row is None:
        return 'idle'
    eid, body = row
    answer = receive(root, json.loads(body), fault)
    if answer not in ('accepted', 'duplicate'):
        return answer  # Conflict never advances sender custody acknowledgement.
    with tx(root/'producer.db') as c:
        c.execute('UPDATE outbox SET accepted=1 WHERE event_id=? AND body=?', (eid, body))
        crash('relay_before_ack_commit', fault)
    crash('relay_after_ack_commit', fault)
    return answer


def decode(event, support_v2):
    schema = event['schema']
    if schema != 1 and not (schema == 2 and support_v2):
        return None, 'unsupported_schema'
    field = 'amount' if schema == 1 else 'units'
    if set(event['payload']) != {field}:
        return None, 'invalid_payload'
    value = event['payload'][field]
    if type(value) is not int or not 1 <= value <= 1000000:
        return None, 'invalid_payload'
    return value, None


def apply_next(root, flow_id, support_v2=False, fault=None):
    """Apply exactly the next prefix element, with a local transactional effect."""
    key(flow_id)
    if type(support_v2) is not bool:
        raise ValueError('support_v2 must be bool')
    with tx(Path(root)/'consumer.db') as c:
        old = c.execute('SELECT last_seq,state,amount FROM projection WHERE flow_id=?',
                        (flow_id,)).fetchone()
        seq, state, fixed_amount = old if old else (0, 'new', None)
        row = c.execute('SELECT event_id,body,state FROM inbox WHERE flow_id=? AND seq=?',
                        (flow_id, seq+1)).fetchone()
        if row is None:
            future = c.execute('SELECT 1 FROM inbox WHERE flow_id=? AND seq>? LIMIT 1',
                               (flow_id, seq)).fetchone()
            return 'gap' if future else 'idle'
        eid, body, inbox_state = row
        if inbox_state == 'applied':
            raise RuntimeError('projection/inbox invariant violated')
        event = json.loads(body)
        amount, reason = decode(event, support_v2)
        if reason is None and (event['kind'] != NEXT.get(state) or
                               (fixed_amount is not None and amount != fixed_amount)):
            reason = 'invalid_transition'
        if reason:
            c.execute("UPDATE inbox SET state='blocked',reason=? WHERE event_id=?", (reason, eid))
            return reason
        held = 0 if event['kind'] == 'released' else amount
        c.execute('INSERT INTO projection VALUES(?,?,?,?,?) ON CONFLICT(flow_id) DO UPDATE '
                  'SET last_seq=excluded.last_seq,state=excluded.state,held=excluded.held',
                  (flow_id, seq+1, event['kind'], amount, held))
        crash('apply_after_projection', fault)
        c.execute('INSERT INTO effect VALUES(?,?,?,?,?)', (eid, flow_id, seq+1, event['kind'], amount))
        c.execute("UPDATE inbox SET state='applied',reason=NULL WHERE event_id=?", (eid,))
        crash('apply_before_commit', fault)
    crash('apply_after_commit', fault)
    return 'applied'


def drain(root, flow_id, support_v2=False, limit=100):
    integer(limit, 1, 1000)
    count = 0
    while count < limit:
        result = apply_next(root, flow_id, support_v2)
        if result != 'applied':
            return {'applied': count, 'stop': result}
        count += 1
    return {'applied': count, 'stop': 'limit'}


def process_all(root, support_v2=False):
    with closing(connect(Path(root)/'consumer.db')) as c:
        ids = [r[0] for r in c.execute("SELECT DISTINCT flow_id FROM inbox WHERE state!='applied' ORDER BY flow_id")]
    return {fid: drain(root, fid, support_v2) for fid in ids}


def snapshot(root):
    """Each file is coherent; use after workers stop, not as a cross-file snapshot."""
    root = Path(root); result = {}
    queries = {
        'producer.db': {'flows': 'SELECT * FROM flow ORDER BY flow_id',
                        'outbox': 'SELECT event_id,flow_id,seq,accepted FROM outbox ORDER BY flow_id,seq'},
        'consumer.db': {'inbox': 'SELECT event_id,flow_id,seq,state,reason FROM inbox ORDER BY flow_id,seq',
                        'projections': 'SELECT * FROM projection ORDER BY flow_id',
                        'effects': 'SELECT * FROM effect ORDER BY flow_id,seq'}}
    for filename, sections in queries.items():
        with closing(connect(root/filename)) as c:
            c.execute('BEGIN')
            for name, query in sections.items():
                result[name] = [list(row) for row in c.execute(query)]
    return result


def unsafe_state_then_event(root):
    """Deliberately broken dual write, isolated to the negative experiment."""
    with tx(Path(root)/'producer.db') as c:
        c.execute("INSERT INTO flow VALUES('A',1,'reserved',3)")
    os._exit(81)  # No pending event exists for a relay to recover.


def unsafe_arrival_order(path, arrival):
    """Real SQLite negative control: deduplicate IDs, blindly overwrite state."""
    with tx(path) as c:
        c.execute('CREATE TABLE seen(event_id TEXT PRIMARY KEY, arrival INTEGER, kind TEXT)')
        c.execute('CREATE TABLE view(seq INTEGER, state TEXT, held INTEGER)')
        c.execute("INSERT INTO view VALUES(0,'new',0)")
        for index, event in enumerate(arrival):
            if c.execute('SELECT 1 FROM seen WHERE event_id=?', (event['event_id'],)).fetchone():
                continue
            c.execute('INSERT INTO seen VALUES(?,?,?)', (event['event_id'], index, event['kind']))
            held = 0 if event['kind'] == 'released' else event['payload']['amount']
            c.execute('UPDATE view SET seq=?,state=?,held=?', (event['seq'], event['kind'], held))
        return {'view': list(c.execute('SELECT * FROM view').fetchone()),
                'effect_order': [r[0] for r in c.execute('SELECT kind FROM seen ORDER BY arrival')]}

"""Synthetic USD-cent budget ledger. Trusted in-process adapter, NOT an API/security boundary."""
import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager, closing

LIMIT = 10**12  # Leaves ample signed-64-bit headroom for the bounded demo.


def amount(value, positive=False):
    if type(value) is not int or not (int(positive) <= value <= LIMIT):
        raise ValueError('integer cents outside supported range')
    return value


def name(value):
    if not isinstance(value, str) or not value or len(value) > 128:
        raise ValueError('invalid identifier')
    return value


def intent(tool, arguments, maximum, quote):
    amount(maximum, True)
    name(tool); name(quote)
    if not isinstance(arguments, dict) or any(
        not isinstance(k, str) or not isinstance(v, str) for k, v in arguments.items()
    ):
        raise ValueError('demo arguments must be string pairs')
    raw = json.dumps({'currency': 'USD', 'tool': tool, 'args': arguments,
                      'maximum': maximum, 'quote': quote}, sort_keys=True,
                     ensure_ascii=True, separators=(',', ':'))
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def connect(path):
    c = sqlite3.connect(path, timeout=15, isolation_level=None)
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA synchronous=FULL')
    return c


def init(path, cap):
    amount(cap, True)
    with closing(connect(path)) as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS wallet(id INTEGER PRIMARY KEY CHECK(id=1),
          cap INTEGER NOT NULL, frozen INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS call(op TEXT PRIMARY KEY, raw TEXT NOT NULL,
          digest TEXT NOT NULL, maximum INTEGER NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('reserved','unknown','settled')),
          charged INTEGER, evidence TEXT UNIQUE);
        ''')
        c.execute('INSERT OR IGNORE INTO wallet(id,cap) VALUES(1,?)', (cap,))
        if c.execute('SELECT cap FROM wallet').fetchone()[0] != cap:
            raise ValueError('existing cap differs; initialization cannot refill it')


@contextmanager
def transaction(path):
    c = connect(path)
    try:
        c.execute('BEGIN IMMEDIATE')
        yield c
        c.commit()
    except BaseException:
        c.rollback()
        raise
    finally:
        c.close()


def crash(point, requested):
    if point == requested:
        os._exit(73)


def exposure(c):
    # Every unresolved call carries its full maximum; settled calls carry final charge.
    return sum(row[0] for row in c.execute(
        'SELECT CASE WHEN state="settled" THEN charged ELSE maximum END FROM call'))


def reserve(path, op, tool, arguments, maximum, quote, fault=None):
    """Called ONLY after trusted bound/approval checks. No model-estimated maxima."""
    name(op)
    raw, digest = intent(tool, arguments, maximum, quote)
    with transaction(path) as c:
        old = c.execute('SELECT digest FROM call WHERE op=?', (op,)).fetchone()
        if old:
            return 'existing' if old[0] == digest else 'conflict'
        cap, frozen = c.execute('SELECT cap,frozen FROM wallet').fetchone()
        if frozen:
            return 'frozen'
        if exposure(c) + maximum > cap:
            return 'budget_exceeded'
        c.execute('INSERT INTO call(op,raw,digest,maximum,state) VALUES(?,?,?,?,?)',
                  (op, raw, digest, maximum, 'reserved'))
        crash('reserve_before_commit', fault)
    crash('reserve_after_commit', fault)
    return 'reserved'


def claim(path, op, tool, arguments, maximum, quote, fault=None):
    """Returns a snapshot once. Caller may dispatch ONCE; replay never re-dispatches."""
    name(op)
    raw, digest = intent(tool, arguments, maximum, quote)
    with transaction(path) as c:
        if c.execute('SELECT frozen FROM wallet').fetchone()[0]:
            return None
        row = c.execute('SELECT digest,state FROM call WHERE op=?', (op,)).fetchone()
        if row != (digest, 'reserved'):
            return None
        c.execute('UPDATE call SET state="unknown" WHERE op=?', (op,))
        crash('claim_before_commit', fault)
    crash('claim_after_commit', fault)
    return json.loads(raw)


def reconcile(path, op, charged, evidence, fault=None):
    """Trusted FINAL bill verifier only. An unverified response is not evidence.

    The fixture assumes the bill is complete and immutable. It does not authenticate
    providers, validate receipts or handle later billing revisions/refunds.
    """
    name(op); name(evidence); amount(charged)
    with transaction(path) as c:
        row = c.execute('SELECT state,maximum,charged,evidence FROM call WHERE op=?',
                        (op,)).fetchone()
        if not row:
            return 'missing'
        state, maximum, old_charge, old_evidence = row
        if state == 'settled':
            return 'replayed' if (charged, evidence) == (old_charge, old_evidence) else 'conflict'
        if state != 'unknown':
            return 'not_dispatched'
        if c.execute('SELECT 1 FROM call WHERE evidence=?', (evidence,)).fetchone():
            return 'evidence_conflict'
        c.execute('UPDATE call SET state="settled",charged=?,evidence=? WHERE op=?',
                  (charged, evidence, op))
        if charged > maximum:
            c.execute('UPDATE wallet SET frozen=1')
        crash('settle_before_commit', fault)
    crash('settle_after_commit', fault)
    return 'bound_breached' if charged > maximum else 'settled'


def snapshot(path):
    with closing(connect(path)) as c:
        c.execute('BEGIN')  # One consistent diagnostic read snapshot.
        cap, frozen = c.execute('SELECT cap,frozen FROM wallet').fetchone()
        used = exposure(c)
        return {'cap_cents': cap, 'exposure_cents': used, 'remaining_cents': cap-used,
                'frozen': bool(frozen), 'calls': [dict(zip(
                    ('op','maximum_cents','state','charged_cents','evidence'), row))
                    for row in c.execute('SELECT op,maximum,state,charged,evidence '
                                         'FROM call ORDER BY op')]}

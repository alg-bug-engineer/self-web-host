"""Local, synthetic two-reservation saga. No network or authorization layer."""
import os
import sqlite3
from contextlib import contextmanager, closing
from pathlib import Path


def connect(path):
    c = sqlite3.connect(path, timeout=20, isolation_level=None)
    c.execute('PRAGMA synchronous=FULL')
    return c


@contextmanager
def tx(path):
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


def validate(key, amount):
    if not isinstance(key, str) or not key or len(key) > 100:
        raise ValueError('key must be nonempty text <=100 characters')
    if type(amount) is not int or not 1 <= amount <= 1000000:
        raise ValueError('amount must be an integer in 1..1000000')


def init_resource(path, capacity):
    if type(capacity) is not int or not 0 <= capacity <= 1000000:
        raise ValueError('invalid capacity')
    with closing(connect(path)) as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.execute('CREATE TABLE IF NOT EXISTS resource (id INTEGER PRIMARY KEY CHECK(id=1), capacity INTEGER NOT NULL CHECK(capacity>=0))')
        c.execute('CREATE TABLE IF NOT EXISTS booking (key TEXT PRIMARY KEY, amount INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ("reserved","rejected","released")))')
        c.execute('CREATE TABLE IF NOT EXISTS event (key TEXT, kind TEXT, amount INTEGER, PRIMARY KEY(key,kind))')
    with tx(path) as c:
        row = c.execute('SELECT capacity FROM resource').fetchone()
        if row is None:
            c.execute('INSERT INTO resource VALUES(1,?)', (capacity,))
        elif row[0] != capacity:
            raise ValueError('capacity mismatch; initialization does not reset stock')


def reserve(path, key, amount, fault=None):
    validate(key, amount)
    with tx(path) as c:
        old = c.execute('SELECT amount,state FROM booking WHERE key=?', (key,)).fetchone()
        if old:
            return old[1] if old[0] == amount else 'conflict'
        capacity = c.execute('SELECT capacity FROM resource').fetchone()[0]
        used = c.execute('SELECT COALESCE(SUM(amount),0) FROM booking WHERE state="reserved"').fetchone()[0]
        state = 'reserved' if used + amount <= capacity else 'rejected'
        c.execute('INSERT INTO booking VALUES(?,?,?)', (key, amount, state))
        c.execute('INSERT INTO event VALUES(?,?,?)', (key, state, amount))
        crash('before_commit', fault)
    crash('after_commit', fault)
    return state


def release(path, key, amount, fault=None):
    """Trusted compensation endpoint. released is a permanent anti-replay tombstone."""
    validate(key, amount)
    with tx(path) as c:
        old = c.execute('SELECT amount,state FROM booking WHERE key=?', (key,)).fetchone()
        if old and old[0] != amount:
            return 'conflict'
        if old and old[1] == 'released':
            return 'released'
        if old and old[1] == 'rejected':
            return 'rejected'
        if old:
            c.execute('UPDATE booking SET state="released" WHERE key=?', (key,))
        else:
            c.execute('INSERT INTO booking VALUES(?,?,"released")', (key, amount))
        c.execute('INSERT INTO event VALUES(?,"released",?)', (key, amount))
        crash('before_commit', fault)
    crash('after_commit', fault)
    return 'released'


def snapshot(path):
    with closing(connect(path)) as c:
        c.execute('BEGIN')  # One coherent resource view, not a cross-file snapshot.
        capacity = c.execute('SELECT capacity FROM resource').fetchone()[0]
        rows = c.execute('SELECT key,amount,state FROM booking ORDER BY key').fetchall()
        return {'capacity': capacity, 'used': sum(n for _, n, s in rows if s == 'reserved'),
                'bookings': [list(r) for r in rows],
                'events': [list(r) for r in c.execute('SELECT key,kind,amount FROM event ORDER BY key,kind')]}


def init(root, stock=10, slots=10):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    init_resource(root/'stock.db', stock)
    init_resource(root/'slots.db', slots)
    with closing(connect(root/'flow.db')) as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.execute('CREATE TABLE IF NOT EXISTS saga (key TEXT PRIMARY KEY, amount INTEGER NOT NULL, phase TEXT NOT NULL CHECK(phase IN ("stock_pending","slot_pending","release_pending","done","aborted")))')


def start(root, key, amount):
    validate(key, amount)
    with tx(Path(root)/'flow.db') as c:
        old = c.execute('SELECT amount FROM saga WHERE key=?', (key,)).fetchone()
        if old:
            return 'existing' if old[0] == amount else 'conflict'
        c.execute('INSERT INTO saga VALUES(?,?,"stock_pending")', (key, amount))
    return 'started'


def status(root, key):
    with closing(connect(Path(root)/'flow.db')) as c:
        row = c.execute('SELECT amount,phase FROM saga WHERE key=?', (key,)).fetchone()
    if row is None:
        raise KeyError(key)
    return row


def step(root, key, fault=None):
    """One resumable transition. Faults are injected test inputs, never production flags."""
    root = Path(root)
    amount, phase = status(root, key)
    if phase in ('done', 'aborted'):
        return phase
    if fault == 'unavailable':
        raise TimeoutError('synthetic missing response; no terminal business decision')
    p_fault = fault if fault in ('before_commit', 'after_commit') else None
    if phase == 'stock_pending':
        result = reserve(root/'stock.db', key, amount, p_fault)
        next_phase = {'reserved': 'slot_pending', 'rejected': 'aborted'}.get(result)
    elif phase == 'slot_pending':
        result = reserve(root/'slots.db', key, amount, p_fault)
        next_phase = {'reserved': 'done', 'rejected': 'release_pending'}.get(result)
    else:
        result = release(root/'stock.db', key, amount, p_fault)
        next_phase = 'aborted' if result == 'released' else None
    if next_phase is None:
        current = status(root, key)[1]
        if current != phase:
            return current
        raise RuntimeError('participant conflict or unauthorized state mutation: '+result)
    # No participant call is performed while the coordinator write lock is held.
    with tx(root/'flow.db') as c:
        c.execute('UPDATE saga SET phase=? WHERE key=? AND phase=?', (next_phase, key, phase))
        crash('coordinator_before_commit', fault)
    crash('coordinator_after_commit', fault)
    return status(root, key)[1]


def finish(root, key):
    # Bounded test driver, not a retry scheduler. Errors propagate and preserve state.
    for _ in range(6):
        phase = step(root, key)
        if phase in ('done', 'aborted'):
            return phase
    raise RuntimeError('did not reach terminal phase')

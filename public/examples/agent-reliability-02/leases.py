"""Single-host fencing mechanism experiment; trusted epochs, synthetic values only."""
from contextlib import contextmanager
from pathlib import Path
import sqlite3

@contextmanager
def tx(path):
    c = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=rw', uri=True, isolation_level=None, timeout=10)
    c.row_factory = sqlite3.Row
    try:
        c.execute('BEGIN IMMEDIATE')
        yield c
        c.commit()
    except BaseException:
        c.rollback()
        raise
    finally:
        c.close()

def init(path):
    c = sqlite3.connect(path)
    c.executescript('''PRAGMA journal_mode=WAL;
    CREATE TABLE lease(resource TEXT PRIMARY KEY, owner TEXT, epoch INTEGER NOT NULL, deadline INTEGER NOT NULL, result TEXT);
    CREATE TABLE sink(resource TEXT PRIMARY KEY, epoch INTEGER NOT NULL, value TEXT);
    ''')
    c.close()

def check(resource, now, ttl=1):
    if not isinstance(resource,str) or not resource or type(now) is not int or type(ttl) is not int or ttl <= 0:
        raise ValueError('nonempty resource, integer tick, positive ttl required')

def acquire(path, resource, owner, now, ttl=10):
    check(resource, now, ttl)
    if not isinstance(owner,str) or not owner: raise ValueError('owner required')
    with tx(path) as c:
        r=c.execute('SELECT * FROM lease WHERE resource=?',(resource,)).fetchone()
        if r and now < r['deadline']: return None
        epoch=1 if r is None else r['epoch']+1
        c.execute('INSERT INTO lease VALUES(?,?,?,?,NULL) ON CONFLICT(resource) DO UPDATE SET owner=excluded.owner,epoch=excluded.epoch,deadline=excluded.deadline,result=NULL',(resource,owner,epoch,now+ttl))
        return epoch

def renew(path, resource, owner, epoch, now, ttl=10):
    check(resource,now,ttl)
    with tx(path) as c:
        return c.execute('UPDATE lease SET deadline=? WHERE resource=? AND owner=? AND epoch=? AND deadline>?',(now+ttl,resource,owner,epoch,now)).rowcount == 1

def complete(path, resource, owner, epoch, now, value):
    check(resource,now)
    with tx(path) as c:
        return c.execute('UPDATE lease SET result=? WHERE resource=? AND owner=? AND epoch=? AND deadline>?',(value,resource,owner,epoch,now)).rowcount == 1

def write(path, resource, epoch, value, fenced=True, fail=False):
    # Epoch provenance is a TRUST assumption, not an authentication implementation.
    if type(epoch) is not int or epoch < 1 or not isinstance(resource,str) or not resource or not isinstance(value,str):
        raise ValueError('invalid write')
    with tx(path) as c:
        row=c.execute('SELECT * FROM sink WHERE resource=?',(resource,)).fetchone()
        if fenced and row:
            if epoch < row['epoch']: return 'stale'
            if epoch == row['epoch']:
                if value != row['value']: return 'conflict'
                return 'replay'
        c.execute('INSERT INTO sink VALUES(?,?,?) ON CONFLICT(resource) DO UPDATE SET epoch=excluded.epoch,value=excluded.value',(resource,epoch,value))
        if fail: raise RuntimeError('injected before transaction commit')
        return 'written'

def snapshot(path):
    with tx(path) as c:
        return {table:[dict(r) for r in c.execute('SELECT * FROM '+table+' ORDER BY resource')] for table in ['lease','sink']}

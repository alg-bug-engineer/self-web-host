"""Version-pinned local workflow teaching model; no remote tools or authorization."""
import hashlib
import json
import os
import sqlite3
from contextlib import contextmanager

V1 = {'abi': 'local-ledger/1', 'steps': [['base', 'units'], ['bonus', 1]]}
V2 = {'abi': 'local-ledger/1', 'steps': [['bonus', 3], ['base', 'units']]}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def validate(manifest):
    if not isinstance(manifest, dict) or set(manifest) != {'abi', 'steps'}:
        raise ValueError('manifest fields')
    if manifest['abi'] != 'local-ledger/1':
        raise ValueError('unsupported interpreter ABI')
    steps = manifest['steps']
    if not isinstance(steps, list) or not 1 <= len(steps) <= 8:
        raise ValueError('one to eight steps required')
    names = []
    for step in steps:
        if not isinstance(step, list) or len(step) != 2:
            raise ValueError('step shape')
        name, amount = step
        if not isinstance(name, str) or not name or len(name) > 40:
            raise ValueError('step name')
        if amount != 'units' and (type(amount) is not int or not 0 <= amount <= 100):
            raise ValueError('step value')
        names.append(name)
    if len(set(names)) != len(names):
        raise ValueError('duplicate step name')


def digest(manifest):
    validate(manifest)
    return hashlib.sha256(canonical(manifest).encode()).hexdigest()


D1, D2 = digest(V1), digest(V2)


def connect(path):
    db = sqlite3.connect(path, isolation_level=None, timeout=15)
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
        CREATE TABLE IF NOT EXISTS definition(digest TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS route(id INTEGER PRIMARY KEY CHECK(id=1),
          digest TEXT REFERENCES definition(digest), revision INTEGER NOT NULL);
        INSERT OR IGNORE INTO route VALUES(1,NULL,0);
        CREATE TABLE IF NOT EXISTS job(id TEXT PRIMARY KEY, units INTEGER NOT NULL,
          accepted_digest TEXT NOT NULL REFERENCES definition(digest),
          current_digest TEXT NOT NULL REFERENCES definition(digest),
          binding_revision INTEGER NOT NULL DEFAULT 0,
          state TEXT NOT NULL CHECK(state IN ('ready','inflight','done')),
          cursor INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS effect(job_id TEXT NOT NULL REFERENCES job(id),
          step_index INTEGER NOT NULL, digest TEXT NOT NULL REFERENCES definition(digest),
          step_name TEXT NOT NULL, amount INTEGER NOT NULL,
          PRIMARY KEY(job_id,step_index));
        CREATE TABLE IF NOT EXISTS migration(job_id TEXT NOT NULL REFERENCES job(id),
          binding_revision INTEGER NOT NULL, old_digest TEXT NOT NULL, new_digest TEXT NOT NULL,
          reason TEXT NOT NULL, PRIMARY KEY(job_id,binding_revision));
        ''')
    finally:
        db.close()


def register(path, manifest):
    key, body = digest(manifest), canonical(manifest)
    with transaction(path) as db:
        old = db.execute('SELECT body FROM definition WHERE digest=?', (key,)).fetchone()
        if old and old['body'] != body:
            raise ValueError('digest collision or corrupted registry')
        db.execute('INSERT OR IGNORE INTO definition VALUES(?,?)', (key, body))
    return key


def switch(path, expected_revision, target, fault=None):
    if type(expected_revision) is not int or expected_revision < 0:
        raise ValueError('nonnegative route revision')
    with transaction(path, fault) as db:
        row = db.execute('SELECT * FROM route').fetchone()
        if row['revision'] != expected_revision:
            return 'stale'
        if not db.execute('SELECT 1 FROM definition WHERE digest=?', (target,)).fetchone():
            return 'unknown_definition'
        if row['digest'] == target:
            return 'unchanged'
        db.execute('UPDATE route SET digest=?,revision=revision+1 WHERE id=1', (target,))
        return 'switched'


def admit(path, identity, units, fault=None):
    if not isinstance(identity, str) or not identity or type(units) is not int or not 1 <= units <= 100:
        raise ValueError('nonempty id and integer units in 1..100 required')
    with transaction(path, fault) as db:
        old = db.execute('SELECT units FROM job WHERE id=?', (identity,)).fetchone()
        if old:
            return 'replay' if old['units'] == units else 'conflict'
        key = db.execute('SELECT digest FROM route').fetchone()[0]
        if key is None:
            return 'unconfigured'
        db.execute('INSERT INTO job(id,units,accepted_digest,current_digest,state) VALUES(?,?,?,?,?)',
                   (identity, units, key, key, 'ready'))
        return 'accepted'


def capabilities(manifests):
    # An explicit local allowlist, NOT remote attestation or binary verification.
    return {digest(m): canonical(m) for m in manifests}


def claim(path, manifests, fault=None):
    allowed = capabilities(manifests)
    with transaction(path, fault) as db:
        for row in db.execute("SELECT * FROM job WHERE state='ready' ORDER BY id"):
            if row['current_digest'] not in allowed:
                continue
            generation = row['generation'] + 1
            db.execute("UPDATE job SET state='inflight',generation=? WHERE id=?", (generation,row['id']))
            return (row['id'], row['binding_revision'], generation, row['cursor'], row['current_digest'])
        return None


def step(path, token, manifests, fault=None):
    allowed = capabilities(manifests)
    with transaction(path, fault) as db:
        row = db.execute('SELECT * FROM job WHERE id=?', (token[0],)).fetchone()
        if not row or row['state'] != 'inflight' or tuple(row[k] for k in
                ('id','binding_revision','generation','cursor','current_digest')) != tuple(token):
            return 'stale'
        key = row['current_digest']
        if key not in allowed:
            return 'unsupported'
        body = db.execute('SELECT body FROM definition WHERE digest=?', (key,)).fetchone()[0]
        if body != allowed[key]:
            raise ValueError('registry and local definition differ')
        manifest = json.loads(body)
        name, value = manifest['steps'][row['cursor']]
        amount = row['units'] if value == 'units' else value
        db.execute('INSERT INTO effect VALUES(?,?,?,?,?)', (row['id'],row['cursor'],key,name,amount))
        crash('after_effect', fault)
        cursor = row['cursor'] + 1
        state = 'done' if cursor == len(manifest['steps']) else 'ready'
        db.execute('UPDATE job SET cursor=?,state=? WHERE id=?', (cursor,state,row['id']))
        return state


def recover(path, identity, expected_generation):
    # Explicit trusted recovery only. Safe here because ALL effects commit in this DB.
    with transaction(path) as db:
        changed = db.execute("UPDATE job SET state='ready',generation=generation+1 WHERE id=? AND generation=? AND state='inflight'",
                             (identity,expected_generation)).rowcount
        return 'recovered' if changed else 'stale'


def migrate(path, identity, expected_binding, target, reason, fault=None):
    # Trusted operator input. This changes semantics; this function does not grant permission.
    if type(expected_binding) is not int or expected_binding < 0 or not isinstance(reason,str) or not reason.strip():
        raise ValueError('binding revision and explicit reason required')
    with transaction(path, fault) as db:
        row = db.execute('SELECT * FROM job WHERE id=?', (identity,)).fetchone()
        if not row:
            return 'missing'
        if row['binding_revision'] != expected_binding:
            return 'stale'
        if row['state'] != 'ready' or row['cursor'] != 0:
            return 'started'
        if not db.execute('SELECT 1 FROM definition WHERE digest=?', (target,)).fetchone():
            return 'unknown_definition'
        if target == row['current_digest']:
            return 'unchanged'
        revision = expected_binding + 1
        db.execute('INSERT INTO migration VALUES(?,?,?,?,?)',
                   (identity,revision,row['current_digest'],target,reason))
        crash('after_audit', fault)
        db.execute('UPDATE job SET current_digest=?,binding_revision=?,generation=generation+1 WHERE id=?',
                   (target,revision,identity))
        return 'migrated'


def snapshot(path):
    db = connect(path)
    try:
        db.execute('BEGIN')
        route = dict(db.execute('SELECT digest,revision FROM route').fetchone())
        jobs = [dict(r) for r in db.execute('SELECT * FROM job ORDER BY id')]
        effects = [dict(r) for r in db.execute('SELECT * FROM effect ORDER BY job_id,step_index')]
        migrations = [dict(r) for r in db.execute('SELECT * FROM migration ORDER BY job_id,binding_revision')]
        demand = {r[0]:r[1] for r in db.execute("SELECT current_digest,count(*) FROM job WHERE state!='done' GROUP BY current_digest")}
        return {'route':route,'jobs':jobs,'effects':effects,'migrations':migrations,'unfinished_by_definition':demand}
    finally:
        db.close()


def drain(path, manifests):
    while (token := claim(path, manifests)) is not None:
        step(path, token, manifests)
    return snapshot(path)

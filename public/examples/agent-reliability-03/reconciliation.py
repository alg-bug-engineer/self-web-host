"""Single-host executable model; approval strings are NOT authentication."""
import json
import sqlite3
import subprocess
import sys
from pathlib import Path


def connect(path):
    db = sqlite3.connect(path)
    db.execute('PRAGMA foreign_keys=ON')
    return db


def init_receiver(path):
    with connect(path) as db:
        db.executescript('''
        CREATE TABLE effects(id INTEGER PRIMARY KEY AUTOINCREMENT, operation TEXT NOT NULL,
                             payload TEXT NOT NULL, kind TEXT NOT NULL, target INTEGER);
        CREATE TABLE closed(operation TEXT PRIMARY KEY);
        ''')


def init_sender(path):
    with connect(path) as db:
        db.executescript('''
        CREATE TABLE operations(operation TEXT PRIMARY KEY, payload TEXT NOT NULL,
          state TEXT NOT NULL, version INTEGER NOT NULL, effect INTEGER,
          kind TEXT NOT NULL DEFAULT 'original', target INTEGER);
        CREATE TABLE evidence(id INTEGER PRIMARY KEY, operation TEXT NOT NULL,
          actor TEXT NOT NULL, decision TEXT NOT NULL, snapshot TEXT NOT NULL,
          from_version INTEGER NOT NULL, to_version INTEGER NOT NULL);
        CREATE TABLE approvals(operation TEXT PRIMARY KEY, target INTEGER NOT NULL,
          actor TEXT NOT NULL, original TEXT NOT NULL, original_version INTEGER NOT NULL);
        ''')


def create_operation(path, operation, payload):
    with connect(path) as db:
        db.execute('INSERT INTO operations(operation,payload,state,version,effect) VALUES (?, ?, ?, 0, NULL)',
                   (operation, payload, 'pending'))


def read_operation(path, operation):
    with connect(path) as db:
        row = db.execute('SELECT payload,state,version,effect,kind,target FROM operations WHERE operation=?',
                         (operation,)).fetchone()
    if row is None:
        raise ValueError('unknown operation')
    return dict(zip(('payload', 'state', 'version', 'effect', 'kind', 'target'), row))


def receiver_apply(path, operation, payload, kind='original', target=None):
    """Non-idempotent: repeats create repeats, unless operation is explicitly closed."""
    if kind not in ('original', 'compensation'):
        raise ValueError('invalid kind')
    with connect(path) as db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute('SELECT 1 FROM closed WHERE operation=?', (operation,)).fetchone():
            raise ValueError('operation closed: late write rejected')
        if kind == 'compensation':
            row = db.execute('SELECT kind FROM effects WHERE id=?', (target,)).fetchone()
            if row != ('original',):
                raise ValueError('invalid compensation target')
        elif target is not None:
            raise ValueError('original cannot target another effect')
        return db.execute('INSERT INTO effects(operation,payload,kind,target) VALUES (?,?,?,?)',
                          (operation, payload, kind, target)).lastrowid


def snapshot(path, operation, payload, *, complete=True, authoritative=True, close=False, expected_kind='original', expected_target=None):
    """A receiver-side close and query are atomic with respect to every receiver write.

    close is an extra receiver capability, NOT an ordinary read-only lookup.
    This model exposes all rows; incomplete=False is conservative metadata for tests.
    """
    with connect(path) as db:
        db.execute('BEGIN IMMEDIATE')
        if close:
            db.execute('INSERT OR IGNORE INTO closed VALUES (?)', (operation,))
        rows = db.execute('SELECT id,payload,kind,target FROM effects WHERE operation=? ORDER BY id',
                          (operation,)).fetchall()
        closed = bool(db.execute('SELECT 1 FROM closed WHERE operation=?', (operation,)).fetchone())
    return {'operation': operation, 'expected_payload': payload,
            'expected_kind': expected_kind, 'expected_target': expected_target,
            'source': 'synthetic-receiver-sqlite', 'complete': complete,
            'authoritative': authoritative, 'closed_to_late_writes': closed,
            'matches': [dict(zip(('id', 'payload', 'kind', 'target'), row)) for row in rows]}


def classify(evidence):
    rows = evidence['matches']
    if len(rows) > 1:
        return 'duplicate_matches'
    if rows and rows[0]['payload'] != evidence['expected_payload']:
        return 'payload_mismatch'
    if rows and (rows[0]['kind'] != evidence['expected_kind']
                 or rows[0]['target'] != evidence['expected_target']):
        return 'action_scope_mismatch'
    if rows:
        if (evidence['complete'] and evidence['authoritative']
                and evidence['closed_to_late_writes']):
            return 'unique_exact_match'
        return 'exact_match_existence_only'
    if not evidence['complete'] or not evidence['authoritative']:
        return 'inconclusive'
    if evidence['closed_to_late_writes']:
        return 'terminal_absence'
    return 'inconclusive'


def mark_unknown(path, operation, expected_version):
    with connect(path) as db:
        changed = db.execute("UPDATE operations SET state='unknown',version=version+1 "
                             "WHERE operation=? AND state='pending' AND version=?",
                             (operation, expected_version)).rowcount
        if changed != 1:
            raise ValueError('stale version or dispatch already attempted')


def dispatch_lost_receipt(sender, receiver, operation, *, kind='original', target=None):
    row = read_operation(sender, operation)
    with connect(sender) as db:
        db.execute('BEGIN IMMEDIATE')
        approval = db.execute('SELECT target,original,original_version FROM approvals WHERE operation=?', (operation,)).fetchone()
        original = None if approval is None else db.execute(
            'SELECT state,effect,version FROM operations WHERE operation=?', (approval[1],)).fetchone()
        if (kind, target) != (row['kind'], row['target']):
            raise ValueError('action scope differs from prepared operation')
        if approval is not None:
            if (kind != 'compensation' or approval[0] != target
                    or original != ('confirmed', target, approval[2])):
                raise ValueError('exact-effect approval required')
        elif kind != 'original' or target is not None:
            raise ValueError('exact-effect approval required')
        changed = db.execute("UPDATE operations SET state='unknown',version=version+1 "
                             "WHERE operation=? AND state='pending' AND version=?",
                             (operation, row['version'])).rowcount
        if changed != 1:
            raise ValueError('stale version or dispatch already attempted')
    # Approval validation and sender CAS commit together, BEFORE receiver dispatch.
    process = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--receiver',
                              str(receiver), operation, row['payload'], kind,
                              '' if target is None else str(target)],
                             capture_output=True, timeout=10, check=False)
    if process.returncode != 23 or process.stdout:
        raise RuntimeError('unexpected receiver behavior; sender remains unknown')
    return {'receiver_exit': process.returncode, 'receipt_bytes': len(process.stdout),
            'sender_state': read_operation(sender, operation)['state']}


def reconcile(path, operation, evidence, *, actor, expected_version, decision):
    """Local human-review record with CAS; trusted actor/provenance are assumptions."""
    if not actor.strip():
        raise ValueError('reviewer identity required')
    classification = classify(evidence)
    allowed = {'unique_exact_match': 'confirmed', 'terminal_absence': 'not_applied'}
    if allowed.get(classification) != decision:
        raise ValueError('evidence does not support decision')
    with connect(path) as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT payload,state,version,kind,target FROM operations WHERE operation=?',
                         (operation,)).fetchone()
        if row is None or row[1:3] != ('unknown', expected_version):
            raise ValueError('stale version or operation is not unknown')
        if evidence['operation'] != operation or evidence['expected_payload'] != row[0]:
            raise ValueError('evidence scope mismatch')
        if (evidence['expected_kind'], evidence['expected_target']) != row[3:5]:
            raise ValueError('evidence action scope mismatch')
        effect = evidence['matches'][0]['id'] if decision == 'confirmed' else None
        db.execute('UPDATE operations SET state=?,version=version+1,effect=? WHERE operation=?',
                   (decision, effect, operation))
        db.execute('INSERT INTO evidence(operation,actor,decision,snapshot,from_version,to_version) '
                   'VALUES (?,?,?,?,?,?)', (operation, actor, decision,
                   json.dumps(evidence, sort_keys=True), expected_version, expected_version + 1))


def approve_compensation(path, original, compensation, target, *, actor, expected_version):
    """Persist demo approval scope; does not implement real authorization or undo."""
    if not actor.strip():
        raise ValueError('approver required')
    with connect(path) as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT state,effect,version FROM operations WHERE operation=?', (original,)).fetchone()
        if row != ('confirmed', target, expected_version):
            raise ValueError('approval must target confirmed exact effect')
        payload = 'compensate-effect:' + str(target)
        db.execute('INSERT INTO operations(operation,payload,state,version,effect) VALUES (?, ?, ?, 0, NULL)', (compensation, payload, 'pending'))
        db.execute("UPDATE operations SET kind='compensation',target=? WHERE operation=?", (target, compensation))
        db.execute('INSERT INTO approvals VALUES (?,?,?,?,?)',
                   (compensation, target, actor, original, expected_version))


def delayed_original_probe(receiver, operation, payload, *, close=False, unsafe_retry=False):
    """Real process waits on stdin; lookup/close runs before its original write."""
    process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--delayed',
                                str(receiver), operation, payload, 'original', ''],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    # communicate supplies the permit only AFTER the parent snapshot transaction.
    # Starting the child need not imply it has reached the read; the pipe preserves order.
    before = snapshot(receiver, operation, payload, close=close)
    if unsafe_retry:
        receiver_apply(receiver, operation, payload)
    try:
        out, err = process.communicate('permit\n', timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        raise
    if process.returncode != 0 or out.strip() not in ('applied', 'closed'):
        raise RuntimeError('delayed receiver failed: ' + err)
    return before, out.strip()


if __name__ == '__main__':
    import os
    if len(sys.argv) != 7 or sys.argv[1] not in ('--receiver', '--delayed'):
        raise SystemExit('internal receiver entrypoint')
    if sys.argv[1] == '--delayed':
        if sys.stdin.readline() != 'permit\n':
            raise SystemExit('missing permit')
        try:
            receiver_apply(sys.argv[2], sys.argv[3], sys.argv[4])
        except ValueError as error:
            if 'operation closed' not in str(error):
                raise
            print('closed')
        else:
            print('applied')
        raise SystemExit(0)
    receiver_apply(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5],
                   None if sys.argv[6] == '' else int(sys.argv[6]))
    # Commit completed, then process exits without printing an effect ID/receipt.
    os._exit(23)

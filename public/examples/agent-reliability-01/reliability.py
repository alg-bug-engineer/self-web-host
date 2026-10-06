#!/usr/bin/env python3
"""Synthetic ticket issuance with real SQLite commits and hard process exits.

No network, model, payment, credentials, or production service is used.
The receiver process knows nothing about the sender's database transaction.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys

CRASH_EXIT = 73
LEASE_TICKS = 10
SCRIPT = Path(__file__).resolve()
PAYLOAD = {"title": "Synthetic documentation ticket", "body": "No real service is called."}
MODES = ("naive", "mark_before", "idempotent", "external")
FAULTS = ("", "before_intent_commit", "after_intent_commit", "after_claim",
          "before_receiver_commit", "after_receiver_commit", "after_response_write",
          "after_response_before_ack", "after_ack", "after_mark_before_send",
          "before_external_effect", "after_external_effect")


class Conflict(ValueError):
    """An operation key was reused for a different intent."""


class IntegrityViolation(ValueError):
    """Stored or received data failed validation; do not issue another effect."""


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def fingerprint(encoded):
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def checked_payload(payload):
    if (not isinstance(payload, dict) or set(payload) != {"title", "body"}
            or any(not isinstance(v, str) or not v or len(v) > 2000 for v in payload.values())):
        raise IntegrityViolation("payload must have nonempty string title and body only")
    return canonical(payload)


def checked_identity(caller, key):
    if any(not isinstance(v, str) or not v or len(v) > 128 for v in (caller, key)):
        raise IntegrityViolation("caller and operation key must be nonempty strings <= 128 characters")


def checked_response(response, caller, key, encoded):
    if (not isinstance(response, dict)
            or set(response) != {"caller", "operation_key", "payload_hash", "ticket_id"}
            or response["caller"] != caller or response["operation_key"] != key
            or response["payload_hash"] != fingerprint(encoded)
            or type(response["ticket_id"]) is not int or response["ticket_id"] < 1):
        raise IntegrityViolation("response does not match the requested operation")
    return canonical(response)


def crash(requested, point):
    if requested == point:
        os._exit(CRASH_EXIT)  # Deliberately bypass cleanup, finally, and stdout flushing.


@contextmanager
def db(path):
    # mode=rw refuses to silently create a missing database after data loss.
    connection = sqlite3.connect(Path(path).resolve().as_uri() + "?mode=rw", uri=True,
                                 isolation_level=None, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA synchronous=FULL")
        if connection.execute("PRAGMA journal_mode").fetchone()[0] != "wal":
            raise IntegrityViolation("expected an initialized WAL database")
        yield connection
    finally:
        connection.close()


@contextmanager
def transaction(connection):
    connection.execute("BEGIN IMMEDIATE")
    try:
        yield
        connection.execute("COMMIT")
    except BaseException:
        if connection.in_transaction:
            connection.execute("ROLLBACK")
        raise


def initialize(root):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    names = ("sender.db", "receiver.db", "external.db")
    if any((root / name).exists() for name in names):
        raise FileExistsError("initialize requires a fresh directory, never overwrites existing data")
    schemas = {
        "sender.db": """
          CREATE TABLE requests (operation_key TEXT PRIMARY KEY, caller TEXT NOT NULL);
          CREATE TABLE outbox (
            operation_key TEXT PRIMARY KEY REFERENCES requests(operation_key),
            caller TEXT NOT NULL, payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL,
            mode TEXT NOT NULL CHECK(mode IN ('naive','mark_before','idempotent','external')),
            state TEXT NOT NULL CHECK(state IN ('pending','inflight','done','unknown','blocked')),
            attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER,
            response_json TEXT
          );
        """,
        "receiver.db": """
          CREATE TABLE tickets (ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
            caller TEXT NOT NULL, operation_key TEXT NOT NULL, payload_json TEXT NOT NULL);
          CREATE TABLE receipts (caller TEXT NOT NULL, operation_key TEXT NOT NULL,
            payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL,
            ticket_id INTEGER NOT NULL REFERENCES tickets(ticket_id), response_json TEXT NOT NULL,
            PRIMARY KEY(caller, operation_key));
        """,
        "external.db": """
          CREATE TABLE tickets (ticket_id INTEGER PRIMARY KEY AUTOINCREMENT,
            caller TEXT NOT NULL, operation_key TEXT NOT NULL, payload_json TEXT NOT NULL);
        """,
    }
    for name, schema in schemas.items():
        connection = sqlite3.connect(root / name, isolation_level=None)
        try:
            if connection.execute("PRAGMA journal_mode=WAL").fetchone()[0] != "wal":
                raise IntegrityViolation("WAL unavailable on this filesystem")
            connection.execute("PRAGMA synchronous=FULL")
            connection.executescript(schema)
        finally:
            connection.close()


def enqueue(root, key="op-1", payload=None, mode="idempotent", caller="agent-demo", fault=""):
    payload = PAYLOAD if payload is None else payload
    checked_identity(caller, key)
    encoded = checked_payload(payload)
    if mode not in MODES:
        raise IntegrityViolation("unknown mode")
    with db(Path(root) / "sender.db") as c, transaction(c):
        old = c.execute("SELECT * FROM outbox WHERE operation_key=?", (key,)).fetchone()
        if old:
            if (old["caller"], old["payload_json"], old["payload_hash"], old["mode"]) != (
                    caller, encoded, fingerprint(encoded), mode):
                raise Conflict("producer operation key reused with different intent")
            return False
        c.execute("INSERT INTO requests VALUES (?,?)", (key, caller))
        c.execute("INSERT INTO outbox(operation_key,caller,payload_json,payload_hash,mode,state) "
                  "VALUES (?,?,?,?,?,'pending')", (key, caller, encoded, fingerprint(encoded), mode))
        crash(fault, "before_intent_commit")
    crash(fault, "after_intent_commit")
    return True


def claim(root, key="op-1", now=0):
    """Serialized claim; logical ticks are test input, not a production clock."""
    with db(Path(root) / "sender.db") as c, transaction(c):
        row = c.execute("SELECT * FROM outbox WHERE operation_key=?", (key,)).fetchone()
        if row is None or row["state"] in ("done", "unknown", "blocked"):
            return None
        if row["state"] == "inflight":
            if row["lease_until"] > now:
                return None
            if row["mode"] == "external":
                c.execute("UPDATE outbox SET state='unknown',lease_until=NULL WHERE operation_key=?", (key,))
                return None  # No automatic retry of an ambiguous non-idempotent effect.
        encoded = checked_payload(json.loads(row["payload_json"]))
        if encoded != row["payload_json"] or fingerprint(encoded) != row["payload_hash"]:
            raise IntegrityViolation("outbox payload checksum/canonical form mismatch")
        generation = row["attempts"] + 1
        c.execute("UPDATE outbox SET state='inflight',attempts=?,lease_until=? WHERE operation_key=?",
                  (generation, now + LEASE_TICKS, key))
        result = dict(row)
        result.update(attempts=generation, state="inflight", lease_until=now + LEASE_TICKS)
        return result


def acknowledge(root, job, response):
    encoded = checked_response(response, job["caller"], job["operation_key"], job["payload_json"])
    with db(Path(root) / "sender.db") as c, transaction(c):
        updated = c.execute("UPDATE outbox SET state='done',response_json=?,lease_until=NULL "
                            "WHERE operation_key=? AND state='inflight' AND attempts=?",
                            (encoded, job["operation_key"], job["attempts"]))
        return updated.rowcount == 1  # A stale lease owner cannot overwrite a newer attempt.


def set_terminal(root, job, state):
    with db(Path(root) / "sender.db") as c, transaction(c):
        c.execute("UPDATE outbox SET state=?,lease_until=NULL WHERE operation_key=? "
                  "AND state='inflight' AND attempts=?", (state, job["operation_key"], job["attempts"]))


def response_for(caller, key, encoded, ticket_id):
    return {"caller": caller, "operation_key": key, "payload_hash": fingerprint(encoded), "ticket_id": ticket_id}


def receive(root, caller, key, payload, mode="idempotent", fault=""):
    checked_identity(caller, key)
    encoded = checked_payload(payload)
    root = Path(root)
    if mode == "external":
        # This third DB is an opaque synthetic service with no idempotency API.
        # No sender/receiver transaction can roll back its committed ticket.
        crash(fault, "before_external_effect")
        with db(root / "external.db") as external, transaction(external):
            ticket_id = external.execute("INSERT INTO tickets(caller,operation_key,payload_json) VALUES (?,?,?)",
                                         (caller, key, encoded)).lastrowid
        crash(fault, "after_external_effect")
        return response_for(caller, key, encoded, ticket_id)
    if mode not in ("idempotent", "naive", "mark_before"):
        raise IntegrityViolation("unknown receiver mode")
    with db(root / "receiver.db") as c, transaction(c):
        if mode == "idempotent":
            old = c.execute("SELECT * FROM receipts WHERE caller=? AND operation_key=?", (caller, key)).fetchone()
            if old:
                if old["payload_json"] != encoded or old["payload_hash"] != fingerprint(encoded):
                    raise Conflict("receiver operation key reused with different intent")
                response = json.loads(old["response_json"])
                checked_response(response, caller, key, encoded)
                ticket = c.execute("SELECT * FROM tickets WHERE ticket_id=?", (old["ticket_id"],)).fetchone()
                if (not ticket or response["ticket_id"] != old["ticket_id"]
                        or (ticket["caller"], ticket["operation_key"], ticket["payload_json"]) != (caller, key, encoded)):
                    raise IntegrityViolation("receipt is inconsistent with its committed ticket")
                return response
        ticket_id = c.execute("INSERT INTO tickets(caller,operation_key,payload_json) VALUES (?,?,?)",
                              (caller, key, encoded)).lastrowid
        response = response_for(caller, key, encoded, ticket_id)
        if mode == "idempotent":
            c.execute("INSERT INTO receipts VALUES (?,?,?,?,?,?)",
                      (caller, key, encoded, fingerprint(encoded), ticket_id, canonical(response)))
        crash(fault, "before_receiver_commit")
    crash(fault, "after_receiver_commit")  # COMMIT succeeded; no stdout response exists yet.
    return response


def child_command(action, root, **kwargs):
    command = [sys.executable, str(SCRIPT), action, "--root", str(root)]
    for key, value in kwargs.items():
        if value is not None:
            command += ["--" + key.replace("_", "-"), str(value)]
    return command


def run_child(action, root, **kwargs):
    return subprocess.run(child_command(action, root, **kwargs), capture_output=True, text=True, timeout=30)


def dispatch(root, key="op-1", now=0, fault=""):
    job = claim(root, key, now)
    if job is None:
        return {"status": "not_claimed"}
    crash(fault, "after_claim")
    if job["mode"] == "mark_before":
        set_terminal(root, job, "done")  # Intentionally broken baseline: success before the effect.
        crash(fault, "after_mark_before_send")
    worker = run_child("receive", root, key=key, caller=job["caller"], payload=job["payload_json"],
                       mode=job["mode"], fault=fault)
    # A complete validated response emitted after COMMIT is evidence even if
    # the receiver process exits afterwards. An exit code alone is not an ACK.
    if worker.returncode != 0 and not worker.stdout:
        if worker.returncode == 2:
            # Receiver contract/integrity failures are terminal for this example.
            set_terminal(root, job, "blocked")
            return {"status": "blocked"}
        if job["mode"] == "external":
            set_terminal(root, job, "unknown")
            return {"status": "unknown"}
        return {"status": "no_ack"}  # Leave intent durable; a later expired lease may replay.
    try:
        response = json.loads(worker.stdout)
        checked_response(response, job["caller"], key, job["payload_json"])
    except (ValueError, TypeError):
        set_terminal(root, job, "unknown" if job["mode"] == "external" else "blocked")
        return {"status": "invalid_response"}
    crash(fault, "after_response_before_ack")
    if job["mode"] == "mark_before":
        return {"status": "premarked_done", "response": response}
    saved = acknowledge(root, job, response)
    crash(fault, "after_ack")
    return {"status": "done" if saved else "stale_claim", "response": response}


def snapshot(root, key="op-1"):
    root = Path(root)
    with db(root / "sender.db") as c:
        row = c.execute("SELECT * FROM outbox WHERE operation_key=?", (key,)).fetchone()
        result = {"intent_rows": c.execute("SELECT count(*) FROM requests").fetchone()[0],
                  "sender_state": row["state"] if row else "absent",
                  "attempts": row["attempts"] if row else 0,
                  "response": json.loads(row["response_json"]) if row and row["response_json"] else None}
    with db(root / "receiver.db") as c:
        result["receiver_tickets"] = c.execute("SELECT count(*) FROM tickets").fetchone()[0]
        result["receiver_receipts"] = c.execute("SELECT count(*) FROM receipts").fetchone()[0]
    with db(root / "external.db") as c:
        result["external_tickets"] = c.execute("SELECT count(*) FROM tickets").fetchone()[0]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("init", "enqueue", "dispatch", "receive", "claim", "snapshot"))
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--key", default="op-1")
    parser.add_argument("--caller", default="agent-demo")
    parser.add_argument("--payload", default=canonical(PAYLOAD))
    parser.add_argument("--mode", choices=MODES, default="idempotent")
    parser.add_argument("--fault", choices=FAULTS, default="")
    parser.add_argument("--now", type=int, default=0)
    args = parser.parse_args()
    try:
        if args.action == "init":
            result = initialize(args.root)
        elif args.action == "enqueue":
            result = enqueue(args.root, args.key, json.loads(args.payload), args.mode, args.caller, args.fault)
        elif args.action == "dispatch":
            result = dispatch(args.root, args.key, args.now, args.fault)
        elif args.action == "receive":
            result = receive(args.root, args.caller, args.key, json.loads(args.payload), args.mode, args.fault)
        elif args.action == "claim":
            result = claim(args.root, args.key, args.now)
        else:
            result = snapshot(args.root, args.key)
        print(canonical(result), flush=True)
        if args.action == "receive":
            crash(args.fault, "after_response_write")
        return 0
    except (ValueError, sqlite3.DatabaseError, OSError) as error:
        print(canonical({"error": type(error).__name__, "message": str(error)}), file=sys.stderr, flush=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

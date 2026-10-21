#!/usr/bin/env python3
"""Regression tests; run directly from any working directory, no pip install."""
from pathlib import Path
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.dont_write_bytecode = True  # Do not generate bytecode under public/examples.
import reliability as r
import run_experiment as experiment


class ReliabilityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="agent-reliability-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        r.initialize(self.root)

    def state(self):
        return r.snapshot(self.root)

    def test_duplicate_producer_request_does_not_duplicate_intent(self):
        self.assertTrue(r.enqueue(self.root))
        self.assertFalse(r.enqueue(self.root))
        self.assertEqual(self.state()["intent_rows"], 1)

    def test_producer_conflict_is_rejected(self):
        r.enqueue(self.root)
        with self.assertRaises(r.Conflict):
            r.enqueue(self.root, payload=dict(r.PAYLOAD, title="Different intent"))
        self.assertEqual(self.state()["intent_rows"], 1)

    def test_producer_cannot_change_retry_contract(self):
        r.enqueue(self.root)
        with self.assertRaises(r.Conflict):
            r.enqueue(self.root, mode="external")

    def test_payload_order_does_not_change_identity(self):
        reordered = {"body": r.PAYLOAD["body"], "title": r.PAYLOAD["title"]}
        first = r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        self.assertEqual(first, r.receive(self.root, "agent-demo", "op-1", reordered))
        self.assertEqual(self.state()["receiver_tickets"], 1)

    def test_same_payload_new_operation_key_creates_new_ticket(self):
        for key in ("op-1", "op-2"):
            r.receive(self.root, "agent-demo", key, r.PAYLOAD)
        self.assertEqual(self.state()["receiver_tickets"], 2)

    def test_receiver_key_is_scoped_by_caller(self):
        for caller in ("agent-a", "agent-b"):
            r.receive(self.root, caller, "op-1", r.PAYLOAD)
        self.assertEqual(self.state()["receiver_tickets"], 2)

    def test_mismatched_receiver_payload_is_rejected(self):
        r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        with self.assertRaises(r.Conflict):
            r.receive(self.root, "agent-demo", "op-1", dict(r.PAYLOAD, body="changed"))
        self.assertEqual(self.state()["receiver_tickets"], 1)

    def test_invalid_payload_is_rejected_without_effect(self):
        invalids = ({}, [], dict(r.PAYLOAD, title=True), dict(r.PAYLOAD, extra="field"),
                    dict(r.PAYLOAD, body=""), dict(r.PAYLOAD, body="x" * 2001))
        for payload in invalids:
            with self.subTest(payload_type=type(payload).__name__):
                with self.assertRaises(r.IntegrityViolation):
                    r.receive(self.root, "agent-demo", "op-1", payload)
        self.assertEqual(self.state()["receiver_tickets"], 0)

    def test_invalid_identity_is_rejected_without_effect(self):
        with self.assertRaises(r.IntegrityViolation):
            r.receive(self.root, "", "op-1", r.PAYLOAD)
        self.assertEqual(self.state()["receiver_tickets"], 0)

    def test_done_intent_is_not_dispatched_twice(self):
        r.enqueue(self.root)
        self.assertEqual(r.dispatch(self.root)["status"], "done")
        self.assertEqual(r.dispatch(self.root, now=100)["status"], "not_claimed")
        self.assertEqual(self.state()["attempts"], 1)
        self.assertEqual(self.state()["receiver_tickets"], 1)

    def test_unexpired_lease_cannot_be_reclaimed(self):
        r.enqueue(self.root)
        self.assertIsNotNone(r.claim(self.root, now=0))
        self.assertIsNone(r.claim(self.root, now=9))
        self.assertEqual(r.claim(self.root, now=10)["attempts"], 2)

    def test_stale_ack_is_fenced_but_current_ack_succeeds(self):
        r.enqueue(self.root)
        stale = r.claim(self.root, now=0)
        current = r.claim(self.root, now=10)
        result = r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        self.assertFalse(r.acknowledge(self.root, stale, result))
        self.assertEqual(self.state()["sender_state"], "inflight")
        self.assertTrue(r.acknowledge(self.root, current, result))

    def test_unmatched_response_cannot_acknowledge(self):
        r.enqueue(self.root)
        job = r.claim(self.root)
        response = r.response_for("agent-demo", "other-key", job["payload_json"], 1)
        with self.assertRaises(r.IntegrityViolation):
            r.acknowledge(self.root, job, response)
        self.assertEqual(self.state()["sender_state"], "inflight")

    def test_boolean_ticket_id_is_not_an_integer_response(self):
        r.enqueue(self.root)
        job = r.claim(self.root)
        response = r.response_for("agent-demo", "op-1", job["payload_json"], True)
        with self.assertRaises(r.IntegrityViolation):
            r.acknowledge(self.root, job, response)

    def test_outbox_payload_corruption_fails_before_effect(self):
        r.enqueue(self.root)
        with r.db(self.root / "sender.db") as c:
            c.execute("UPDATE outbox SET payload_json=?", (r.canonical(dict(r.PAYLOAD, title="corrupted")),))
        with self.assertRaises(r.IntegrityViolation):
            r.dispatch(self.root)
        self.assertEqual(self.state()["receiver_tickets"], 0)
        self.assertEqual(self.state()["attempts"], 0)

    def test_outbox_invalid_json_fails_before_effect(self):
        r.enqueue(self.root)
        with r.db(self.root / "sender.db") as c:
            c.execute("UPDATE outbox SET payload_json='not-json'")
        with self.assertRaises(json.JSONDecodeError):
            r.dispatch(self.root)
        self.assertEqual(self.state()["receiver_tickets"], 0)

    def test_receipt_corruption_does_not_execute_again(self):
        r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        with r.db(self.root / "receiver.db") as c:
            c.execute("UPDATE receipts SET response_json='{}'")
        with self.assertRaises(r.IntegrityViolation):
            r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        self.assertEqual(self.state()["receiver_tickets"], 1)

    def test_receipt_ticket_inconsistency_fails_closed(self):
        r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        with r.db(self.root / "receiver.db") as c:
            c.execute("UPDATE tickets SET payload_json='{}'")
        with self.assertRaises(r.IntegrityViolation):
            r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        self.assertEqual(self.state()["receiver_tickets"], 1)

    def test_missing_database_is_not_silently_recreated(self):
        path = self.root / "receiver.db"
        path.rename(self.root / "receiver.saved.db")
        with self.assertRaises(sqlite3.OperationalError):
            r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        self.assertFalse(path.exists())

    def test_invalid_database_header_is_not_treated_as_empty(self):
        (self.root / "receiver.db").write_bytes(b"not a SQLite database")
        with self.assertRaises(sqlite3.DatabaseError):
            r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)

    def test_initialize_refuses_to_overwrite_data(self):
        r.enqueue(self.root)
        with self.assertRaises(FileExistsError):
            r.initialize(self.root)
        self.assertEqual(self.state()["intent_rows"], 1)

    def test_external_worker_crash_before_call_becomes_unknown(self):
        r.enqueue(self.root, mode="external")
        experiment.child("dispatch", self.root, fault="after_claim", expected_exit=r.CRASH_EXIT)
        self.assertEqual(r.dispatch(self.root, now=11)["status"], "not_claimed")
        self.assertEqual(self.state()["sender_state"], "unknown")
        self.assertEqual(self.state()["external_tickets"], 0)

    def test_external_response_lost_before_sender_ack_is_unknown(self):
        r.enqueue(self.root, mode="external")
        experiment.child("dispatch", self.root, fault="after_response_before_ack", expected_exit=r.CRASH_EXIT)
        self.assertEqual(r.dispatch(self.root, now=11)["status"], "not_claimed")
        self.assertEqual(self.state()["sender_state"], "unknown")
        self.assertEqual(self.state()["external_tickets"], 1)

    def test_external_success_can_be_acknowledged_normally(self):
        r.enqueue(self.root, mode="external")
        self.assertEqual(r.dispatch(self.root)["status"], "done")
        self.assertEqual(self.state()["external_tickets"], 1)

    def test_valid_response_survives_receiver_exit_after_write(self):
        r.enqueue(self.root)
        self.assertEqual(r.dispatch(self.root, fault="after_response_write")["status"], "done")
        self.assertEqual(self.state()["attempts"], 1)
        self.assertEqual(self.state()["receiver_tickets"], 1)

    def test_receiver_receipt_corruption_blocks_automatic_replay(self):
        r.enqueue(self.root)
        r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        with r.db(self.root / "receiver.db") as c:
            c.execute("UPDATE receipts SET response_json='{}'")
        self.assertEqual(r.dispatch(self.root)["status"], "blocked")
        self.assertEqual(r.dispatch(self.root, now=100)["status"], "not_claimed")
        self.assertEqual(self.state()["receiver_tickets"], 1)

    def test_receipt_must_remain_for_replay_horizon(self):
        r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        with r.db(self.root / "receiver.db") as c:
            c.execute("DELETE FROM receipts")  # Intentional counterexample, temporary test data only.
        r.receive(self.root, "agent-demo", "op-1", r.PAYLOAD)
        self.assertEqual(self.state()["receiver_tickets"], 2)

    def test_wal_full_sync_and_foreign_keys_are_enabled(self):
        with r.db(self.root / "receiver.db") as c:
            self.assertEqual(c.execute("PRAGMA journal_mode").fetchone()[0], "wal")
            self.assertEqual(c.execute("PRAGMA synchronous").fetchone()[0], 2)
            self.assertEqual(c.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def test_concurrent_timeout_kills_and_reaps_every_worker(self):
        workers = [MagicMock() for _ in range(3)]
        for worker in workers:
            worker.poll.return_value = None
        workers[0].communicate.side_effect = subprocess.TimeoutExpired("synthetic-child", 30)
        with patch.object(experiment.subprocess, "Popen", side_effect=workers):
            with self.assertRaises(subprocess.TimeoutExpired):
                experiment.concurrent("claim", self.root, workers=3)
        for worker in workers:
            worker.kill.assert_called_once()
            worker.wait.assert_called_once_with(timeout=10)
            worker.stdout.close.assert_called_once()
            worker.stderr.close.assert_called_once()

    def test_partial_concurrent_launch_failure_reaps_started_workers(self):
        worker = MagicMock()
        worker.poll.return_value = None
        with patch.object(experiment.subprocess, "Popen", side_effect=[worker, OSError("synthetic launch failure")]):
            with self.assertRaises(OSError):
                experiment.concurrent("claim", self.root, workers=3)
        worker.kill.assert_called_once()
        worker.wait.assert_called_once_with(timeout=10)

    def test_process_crash_matrix_matches_checked_in_results(self):
        with tempfile.TemporaryDirectory(prefix="agent-reliability-matrix-") as directory:
            observed = experiment.run_all(directory)
            # Check physical and referential integrity after all process crashes.
            for path in Path(directory).glob("*/*.db"):
                with r.db(path) as c:
                    self.assertEqual(c.execute("PRAGMA quick_check").fetchone()[0], "ok", str(path))
                    self.assertEqual(c.execute("PRAGMA foreign_key_check").fetchall(), [], str(path))
        expected = json.loads(Path(__file__).with_name("results.json").read_text(encoding="utf-8"))
        self.assertEqual(observed, expected)


if __name__ == "__main__":
    unittest.main(verbosity=2)

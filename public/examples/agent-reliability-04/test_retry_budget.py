"""Executable boundary checks, not production load/concurrency tests."""
from dataclasses import FrozenInstanceError
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from retry_budget import (Budget, Cancellation, Layer, LogicalClock, Outcome, Request,
                     RetryStack, Safety, ScriptedEndpoint, cancel_after_commit,
                     effect_count, init_store, may_retry, receiver_apply)
from run_experiment import run, scenario


class BudgetTests(unittest.TestCase):
    def make(self, deadline=10, cap=3, cancel=None, now=0):
        return Budget(LogicalClock(now), deadline, cap, cancel or Cancellation())

    def test_first_dispatch_consumes_one_token(self):
        budget = self.make(cap=1)
        self.assertIsNone(budget.reserve_dispatch())
        self.assertEqual(budget.used_dispatches, 1)
        self.assertEqual(budget.reserve_dispatch().reason, "dispatch_budget_exhausted")
        self.assertEqual(budget.used_dispatches, 1)

    def test_zero_cap_never_dispatches(self):
        budget = self.make(cap=0)
        self.assertEqual(budget.reserve_dispatch().reason, "dispatch_budget_exhausted")
        self.assertEqual(budget.used_dispatches, 0)

    def test_exact_deadline_denies_new_dispatch(self):
        budget = self.make(now=10)
        self.assertEqual(budget.reserve_dispatch().reason, "deadline_exceeded")
        self.assertEqual(budget.used_dispatches, 0)

    def test_deadline_is_absolute_not_reset_by_spending(self):
        budget = self.make()
        self.assertIsNone(budget.spend_time(4))
        self.assertIsNone(budget.spend_time(4))
        self.assertEqual(budget.deadline_ticks, 10)
        self.assertEqual(budget.spend_time(4).reason, "deadline_exceeded")
        self.assertEqual(budget.clock.now_ticks, 10)

    def test_cancellation_truncates_work(self):
        budget = self.make(cancel=Cancellation(at_ticks=3))
        self.assertEqual(budget.spend_time(9).reason, "cancelled")
        self.assertEqual(budget.clock.now_ticks, 3)

    def test_cancel_before_dispatch_uses_no_token(self):
        cancellation = Cancellation()
        cancellation.cancel()
        budget = self.make(cancel=cancellation)
        self.assertEqual(budget.reserve_dispatch().reason, "cancelled")
        self.assertEqual(budget.used_dispatches, 0)

    def test_cancel_wins_tie_with_deadline(self):
        budget = self.make(cancel=Cancellation(at_ticks=10))
        self.assertEqual(budget.spend_time(12).reason, "cancelled")
        self.assertEqual(budget.clock.now_ticks, 10)

    def test_negative_bool_and_fractional_numbers_rejected(self):
        for bad in (-1, True, 1.5):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    self.make(cap=bad)
                with self.assertRaises(ValueError):
                    self.make(deadline=bad)
                with self.assertRaises(ValueError):
                    LogicalClock(bad)
                with self.assertRaises(ValueError):
                    Layer("sdk", bad)

    def test_clock_cannot_move_backwards(self):
        clock = LogicalClock(3)
        with self.assertRaises(ValueError):
            clock.advance(-1)
        self.assertEqual(clock.now_ticks, 3)


class StackTests(unittest.TestCase):
    def test_reset_scopes_multiply_to_27_dispatches(self):
        result = scenario(reset=True)
        self.assertEqual(result["dispatches"], 27)
        self.assertEqual(result["elapsed_logical_ticks"], 162)
        self.assertEqual(result["status"], "transient")
        self.assertGreater(max(result["dispatch_deadline_logical_ticks"]), 20)

    def test_shared_cap_bounds_entire_stack(self):
        result = scenario(timeout=1000)
        self.assertEqual(result["dispatches"], 4)
        self.assertEqual(result["elapsed_logical_ticks"], 24)
        self.assertEqual(result["reason"], "dispatch_budget_exhausted")

    def test_shared_deadline_stops_fourth_dispatch_partway(self):
        result = scenario(cap=100)
        self.assertEqual(result["dispatches"], 4)
        self.assertEqual(result["dispatch_start_logical_ticks"], [0, 6, 12, 18])
        self.assertEqual(result["dispatch_deadline_logical_ticks"], [20] * 4)
        self.assertEqual(result["elapsed_logical_ticks"], 20)
        self.assertEqual(result["reason"], "deadline_exceeded")

    def test_combined_cap_and_deadline_obeys_both(self):
        result = scenario()
        self.assertLessEqual(result["dispatches"], 4)
        self.assertLessEqual(result["elapsed_logical_ticks"], 20)
        self.assertEqual(result["reason"], "deadline_exceeded")

    def test_first_attempt_plus_two_retries_is_three_not_two(self):
        result = scenario(timeout=100, cap=100, layers=(Layer("sdk", 2),))
        self.assertEqual(result["dispatches"], 3)

    def test_zero_retries_means_one_attempt(self):
        result = scenario(timeout=100, cap=100, layers=(Layer("sdk", 0),))
        self.assertEqual(result["dispatches"], 1)

    def test_backoff_consumes_shared_deadline_across_layers(self):
        result = scenario(timeout=14, cap=100, duration=3,
                          layers=(Layer("agent", 1, 7), Layer("sdk", 1, 7)))
        self.assertEqual(result["dispatches"], 2)
        self.assertEqual(result["elapsed_logical_ticks"], 14)
        self.assertEqual(result["backoff_logical_ticks"], 8)
        self.assertEqual(result["reason"], "deadline_exceeded")

    def test_exhausted_cap_does_not_spend_unusable_backoff(self):
        result = scenario(timeout=100, cap=1, duration=3,
                          layers=(Layer("sdk", 2, 7),))
        self.assertEqual(result["dispatches"], 1)
        self.assertEqual(result["elapsed_logical_ticks"], 3)
        self.assertEqual(result["backoff_logical_ticks"], 0)
        self.assertEqual(result["reason"], "dispatch_budget_exhausted")

    def test_success_prevents_all_remaining_retries(self):
        result = scenario(timeout=100, outcomes=("transient", "success"))
        self.assertEqual(result["dispatches"], 2)
        self.assertEqual(result["status"], "success")

    def test_permanent_failure_is_not_retried(self):
        result = scenario(outcomes=("permanent", "success"))
        self.assertEqual(result["dispatches"], 1)
        self.assertEqual(result["status"], "permanent")

    def test_unknown_nonidempotent_is_not_retried(self):
        result = scenario(request=Request("append", Safety.NON_IDEMPOTENT), outcomes=("unknown", "success"))
        self.assertEqual(result["dispatches"], 1)
        self.assertEqual(result["status"], "unknown")
        self.assertEqual(result["reason"], "unsafe_retry_requires_reconciliation")

    def test_transient_label_alone_does_not_make_mutation_safe(self):
        result = scenario(request=Request("append", Safety.NON_IDEMPOTENT))
        self.assertEqual(result["dispatches"], 1)
        self.assertEqual(result["reason"], "unsafe_retry_requires_reconciliation")

    def test_unknown_readonly_can_retry(self):
        result = scenario(outcomes=("unknown", "success"))
        self.assertEqual(result["dispatches"], 2)
        self.assertEqual(result["status"], "success")

    def test_idempotent_key_survives_reentry_in_outer_layers(self):
        result = scenario(timeout=1000, cap=7,
                          request=Request("append", Safety.IDEMPOTENT, "stable-key"))
        self.assertEqual(result["dispatches"], 7)
        self.assertEqual(result["dispatch_keys"], ["stable-key"] * 7)

    def test_cancel_during_call_counts_that_call_only(self):
        result = scenario(cancellation=Cancellation(at_ticks=4), cap=100, timeout=100)
        self.assertEqual(result["dispatches"], 1)
        self.assertEqual(result["elapsed_logical_ticks"], 4)
        self.assertEqual(result["reason"], "cancelled")

    def test_expired_deadline_calls_no_endpoint(self):
        clock = LogicalClock()
        stack = RetryStack(clock, (Layer("sdk"),), 0, 9)
        endpoint = ScriptedEndpoint()
        self.assertEqual(stack.run(Request("x", Safety.READ_ONLY), endpoint).reason, "deadline_exceeded")
        self.assertEqual(endpoint.calls, 0)

    def test_zero_budget_calls_no_endpoint(self):
        clock = LogicalClock()
        stack = RetryStack(clock, (Layer("sdk"),), 100, 0)
        endpoint = ScriptedEndpoint()
        self.assertEqual(stack.run(Request("x", Safety.READ_ONLY), endpoint).reason, "dispatch_budget_exhausted")
        self.assertEqual(endpoint.calls, 0)

    def test_one_operation_cannot_reset_by_running_stack_again(self):
        stack = RetryStack(LogicalClock(), (Layer("sdk"),), 100, 9)
        request, endpoint = Request("x", Safety.READ_ONLY), ScriptedEndpoint(("success",))
        stack.run(request, endpoint)
        with self.assertRaises(ValueError):
            stack.run(request, endpoint)
        self.assertEqual(endpoint.calls, 1)

    def test_nonzero_start_still_uses_absolute_deadline(self):
        clock = LogicalClock(70)
        stack = RetryStack(clock, (Layer("sdk", 2),), 10, 5)
        self.assertEqual(stack.budget.deadline_ticks, 80)
        result = stack.run(Request("x", Safety.READ_ONLY), ScriptedEndpoint(duration_ticks=6))
        self.assertEqual(result.reason, "deadline_exceeded")
        self.assertEqual(clock.now_ticks, 80)

    def test_noncooperative_work_can_overrun_but_late_success_is_rejected(self):
        clock = LogicalClock()
        stack = RetryStack(clock, (Layer("sdk"),), 10, 3)
        def late_endpoint(request, budget):
            clock.advance(99)
            return Outcome("success")
        result = stack.run(Request("x", Safety.READ_ONLY), late_endpoint)
        self.assertEqual(clock.now_ticks, 99)  # Deadline is NOT preemption.
        self.assertEqual(result.reason, "deadline_exceeded")
        self.assertEqual(stack.budget.used_dispatches, 1)

    def test_late_unknown_keeps_business_uncertainty_and_stop_reason(self):
        clock = LogicalClock()
        stack = RetryStack(clock, (Layer("sdk"),), 10, 3)
        def late_endpoint(request, budget):
            clock.advance(99)
            return Outcome("unknown", "receipt_lost")
        result = stack.run(Request("append", Safety.NON_IDEMPOTENT), late_endpoint)
        self.assertEqual(result.status, "stopped")
        self.assertEqual(result.reason, "deadline_exceeded")
        self.assertEqual(result.business_state, "unknown")
        self.assertEqual(stack.trace.dispatches[0]["observed_status"], "unknown")
        self.assertEqual(stack.trace.dispatches[0]["observed_reason"], "receipt_lost")

    def test_late_confirmed_evidence_does_not_restore_workflow_deadline(self):
        clock = LogicalClock()
        stack = RetryStack(clock, (Layer("sdk"),), 10, 3)
        def late_endpoint(request, budget):
            clock.advance(99)
            return Outcome("success", "late_receipt", 123, "confirmed")
        result = stack.run(Request("append", Safety.IDEMPOTENT, "stable"), late_endpoint)
        self.assertEqual(result.status, "stopped")
        self.assertEqual(result.reason, "deadline_exceeded")
        self.assertEqual(result.business_state, "confirmed")
        self.assertEqual(result.value, 123)

    def test_exhausted_dispatch_budget_keeps_previous_unknown(self):
        result = scenario(timeout=100, cap=1, outcomes=("unknown",),
                          request=Request("append", Safety.IDEMPOTENT, "stable"))
        self.assertEqual(result["dispatches"], 1)
        self.assertEqual(result["reason"], "dispatch_budget_exhausted")
        self.assertEqual(result["business_state"], "unknown")

    def test_completion_exactly_at_deadline_is_rejected(self):
        result = scenario(timeout=6, duration=6, outcomes=("success",))
        self.assertEqual(result["reason"], "deadline_exceeded")
        self.assertEqual(result["dispatches"], 1)

    def test_invalid_endpoint_fixture_is_rejected(self):
        for outcomes in ((), ("made_up",)):
            with self.assertRaises(ValueError):
                ScriptedEndpoint(outcomes)


class RequestTests(unittest.TestCase):
    def test_idempotence_requires_nonempty_stable_key(self):
        for key in (None, "", "   "):
            with self.assertRaises(ValueError):
                Request("append", Safety.IDEMPOTENT, key)

    def test_random_key_does_not_declare_idempotence(self):
        with self.assertRaises(ValueError):
            Request("append", Safety.NON_IDEMPOTENT, "a-key")

    def test_implicit_safety_label_is_rejected(self):
        with self.assertRaises(ValueError):
            Request("append", "declared_idempotent", "a-key")

    def test_request_is_immutable_across_attempts(self):
        request = Request("append", Safety.IDEMPOTENT, "one")
        with self.assertRaises(FrozenInstanceError):
            request.key = "two"

    def test_only_retryable_outcomes_are_retried(self):
        request = Request("lookup", Safety.READ_ONLY)
        for status in ("success", "permanent", "stopped"):
            self.assertFalse(may_retry(request, Outcome(status)))


class SQLiteTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "receiver.db"
        init_store(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_commit_survives_real_subprocess_cancellation_without_receipt(self):
        result = cancel_after_commit(self.path, Request("append", Safety.NON_IDEMPOTENT))
        self.assertTrue(result["worker_terminated"])
        self.assertFalse(result["business_receipt_received"])
        self.assertEqual(result["client_state"], "unknown")
        self.assertEqual(result["effects_after_reopen"], 1)
        self.assertEqual(effect_count(self.path), 1)

    def test_direct_nonidempotent_repeat_really_duplicates(self):
        request = Request("append", Safety.NON_IDEMPOTENT)
        first = receiver_apply(self.path, request)
        second = receiver_apply(self.path, request)
        self.assertNotEqual(first, second)
        self.assertEqual(effect_count(self.path), 2)

    def test_same_key_replay_returns_same_persisted_effect(self):
        request = Request("append", Safety.IDEMPOTENT, "stable")
        first = receiver_apply(self.path, request)
        second = receiver_apply(self.path, request)
        self.assertEqual(first, second)
        self.assertEqual(effect_count(self.path), 1)

    def test_idempotent_replay_after_real_cancellation_deduplicates(self):
        request = Request("append", Safety.IDEMPOTENT, "stable")
        loss = cancel_after_commit(self.path, request)
        self.assertEqual(loss["effects_after_reopen"], 1)
        self.assertTrue(may_retry(request, Outcome("unknown")))
        self.assertEqual(receiver_apply(self.path, request), 1)
        self.assertEqual(effect_count(self.path), 1)

    def test_same_key_different_payload_is_rejected_without_new_effect(self):
        receiver_apply(self.path, Request("first", Safety.IDEMPOTENT, "stable"))
        with self.assertRaisesRegex(ValueError, "different payload"):
            receiver_apply(self.path, Request("second", Safety.IDEMPOTENT, "stable"))
        self.assertEqual(effect_count(self.path), 1)

    def test_changing_key_is_a_new_effect_even_for_same_payload(self):
        receiver_apply(self.path, Request("same", Safety.IDEMPOTENT, "one"))
        receiver_apply(self.path, Request("same", Safety.IDEMPOTENT, "two"))
        self.assertEqual(effect_count(self.path), 2)

    def test_keys_are_scoped_to_operation_namespace(self):
        receiver_apply(self.path, Request("same", Safety.IDEMPOTENT, "key", "scope-A"))
        receiver_apply(self.path, Request("same", Safety.IDEMPOTENT, "key", "scope-B"))
        self.assertEqual(effect_count(self.path), 2)

    def test_readonly_receiver_creates_no_effect(self):
        self.assertEqual(receiver_apply(self.path, Request("count", Safety.READ_ONLY)), 0)
        self.assertEqual(effect_count(self.path), 0)

    def test_dedup_failure_rolls_back_effect_atomically(self):
        with sqlite3.connect(self.path) as db:
            db.executescript("""CREATE TRIGGER reject_dedup BEFORE INSERT ON dedup
                              BEGIN SELECT RAISE(ABORT, 'injected dedup failure'); END;""")
        with self.assertRaises(sqlite3.IntegrityError):
            receiver_apply(self.path, Request("append", Safety.IDEMPOTENT, "one"))
        self.assertEqual(effect_count(self.path), 0)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM dedup").fetchone()[0], 0)


class ArtifactTests(unittest.TestCase):
    def test_actual_semantic_output_matches_checked_artifact(self):
        expected = json.loads(Path(__file__).with_name("results.json").read_text())
        self.assertEqual(run(), expected)

    def test_check_cli_rejects_tampered_artifact(self):
        with tempfile.TemporaryDirectory() as tmp:
            altered = Path(tmp) / "altered.json"
            altered.write_text('{"schema_version": -1}')
            process = subprocess.run([sys.executable, str(Path(__file__).with_name("run_experiment.py")),
                                      "--check", str(altered)], capture_output=True, text=True, timeout=20)
            self.assertNotEqual(process.returncode, 0)
            self.assertIn("differ", process.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)

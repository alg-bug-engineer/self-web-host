"""Produce deterministic semantic results; logical ticks are not latency."""
import argparse
import json
from pathlib import Path
import tempfile
from retry_budget import (Budget, Cancellation, Layer, LogicalClock, Outcome, Request,
                     RetryStack, Safety, ScriptedEndpoint, cancel_after_commit,
                     effect_count, init_store, may_retry, receiver_apply)


LAYERS = (Layer("agent", 2), Layer("tool", 2), Layer("sdk", 2))


def scenario(*, timeout=20, cap=4, reset=False, duration=6,
             outcomes=("transient",), request=None, cancellation=None, layers=LAYERS):
    clock = LogicalClock()
    stack = RetryStack(clock, layers, timeout, cap, cancellation, reset)
    request = request or Request("lookup:synthetic-item", Safety.READ_ONLY)
    endpoint = ScriptedEndpoint(outcomes, duration)
    outcome = stack.run(request, endpoint)
    return {"dispatches": len(stack.trace.dispatches), "elapsed_logical_ticks": clock.now_ticks,
            "status": outcome.status, "reason": outcome.reason,
            "business_state": outcome.business_state,
            "dispatch_start_logical_ticks": [x["start_ticks"] for x in stack.trace.dispatches],
            "dispatch_deadline_logical_ticks": [x["deadline_ticks"] for x in stack.trace.dispatches],
            "dispatch_keys": [x["key"] for x in stack.trace.dispatches],
            "backoff_logical_ticks": sum(x["end_ticks"] - x["start_ticks"] for x in stack.trace.waits)}


def sqlite_scenarios(root):
    unsafe_path = root / "nonidempotent.db"
    init_store(unsafe_path)
    unsafe = Request("append:synthetic-ticket", Safety.NON_IDEMPOTENT)
    unsafe_loss = cancel_after_commit(unsafe_path, unsafe)
    unsafe_loss["retry_permitted"] = may_retry(unsafe, Outcome("unknown"))
    # Explicitly unsafe control, NOT the RetryStack's behavior.
    receiver_apply(unsafe_path, unsafe)
    unsafe_loss["effects_after_deliberate_unsafe_replay"] = effect_count(unsafe_path)

    safe_path = root / "idempotent.db"
    init_store(safe_path)
    safe = Request("append:synthetic-ticket", Safety.IDEMPOTENT, "operation-0001")
    safe_loss = cancel_after_commit(safe_path, safe)
    safe_loss["retry_permitted"] = may_retry(safe, Outcome("unknown"))
    safe_loss["replayed_effect_id"] = receiver_apply(safe_path, safe)
    safe_loss["effects_after_same_key_replay"] = effect_count(safe_path)
    mismatch_rejected = False
    try:
        receiver_apply(safe_path, Request("different-payload", Safety.IDEMPOTENT, safe.key))
    except ValueError:
        mismatch_rejected = True
    safe_loss["changed_payload_same_key_rejected"] = mismatch_rejected
    safe_loss["effects_after_rejected_payload"] = effect_count(safe_path)
    # New key means a new operation, even if a caller calls it a "retry".
    receiver_apply(safe_path, Request(safe.payload, Safety.IDEMPOTENT, "operation-0002"))
    safe_loss["effects_after_deliberate_key_rotation"] = effect_count(safe_path)
    return {"non_idempotent": unsafe_loss, "receiver_idempotent": safe_loss}


def run():
    with tempfile.TemporaryDirectory(prefix="agent-budget-fixture-") as tmp:
        return {
            "schema_version": 1,
            "measurement_boundary": {
                "retry_timing": "synthetic integer logical ticks; not wall-clock latency",
                "persistence": "actual local SQLite transactions and terminated Python subprocesses",
                "concurrency": "sequential retry model; no simultaneous dispatches tested",
                "network_or_models": False,
                "client_state": "missing-receipt state label; no durable sender state machine",
            },
            "configuration": {"layers": 3, "max_retries_per_layer": 2,
                              "max_attempts_per_layer": 3, "multiplicative_attempts": 27,
                              "dispatch_cap_includes_initial_attempt": True},
            "reset_at_every_layer": scenario(reset=True),
            "shared_dispatch_cap": scenario(timeout=1000),
            "shared_absolute_deadline": scenario(cap=100),
            "shared_cap_and_deadline": scenario(),
            "shared_deadline_includes_backoff": scenario(
                timeout=14, cap=100, duration=3,
                layers=(Layer("agent", 1, 7), Layer("sdk", 1, 7))),
            "cancelled_during_dispatch": scenario(timeout=100, cap=100,
                                                    cancellation=Cancellation(at_ticks=4)),
            "unknown_non_idempotent": scenario(timeout=100, duration=3, outcomes=("unknown", "success"),
                request=Request("append:ticket", Safety.NON_IDEMPOTENT)),
            "unknown_read_only": scenario(timeout=100, duration=3, outcomes=("unknown", "success")),
            "unknown_declared_idempotent": scenario(timeout=100, duration=3, outcomes=("unknown", "success"),
                request=Request("append:ticket", Safety.IDEMPOTENT, "stable-operation-1")),
            "sqlite_commit_then_cancel": sqlite_scenarios(Path(tmp)),
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", nargs="?", const=str(Path(__file__).with_name("results.json")),
                        help="rerun and compare complete semantic JSON (default: adjacent results.json)")
    parser.add_argument("--output", type=Path, help="write deterministic results to this file")
    args = parser.parse_args()
    result = run()
    encoded = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.check:
        try:
            expected = json.loads(Path(args.check).read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise SystemExit(f"FAIL: cannot read checked artifact: {exc}")
        if expected != result:
            raise SystemExit("FAIL: experiment results differ from checked artifact")
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Run isolated crash/restart cases; emit deterministic, assertion-checked JSON."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True  # This directory is also served as static website content.
import reliability as r


def must(condition, explanation):
    if not condition:
        raise AssertionError(explanation)


def child(action, root, expected_exit=0, **kwargs):
    process = r.run_child(action, root, **kwargs)
    must(process.returncode == expected_exit,
         f"{action} exit {process.returncode}, expected {expected_exit}: {process.stderr}")
    return json.loads(process.stdout) if process.stdout else None


def concurrent(action, root, workers=8, **kwargs):
    processes = []
    try:
        for _ in range(workers):
            processes.append(subprocess.Popen(r.child_command(action, root, **kwargs),
                                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True))
        outputs = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=30)
            must(process.returncode == 0, stderr)
            outputs.append(json.loads(stdout))
        return outputs
    finally:
        # Also runs on launch failure, timeout, invalid JSON, or child failure.
        # Never remove temporary database files while a worker still uses them.
        for process in processes:
            if process.poll() is None:
                process.kill()
        for process in processes:
            process.wait(timeout=10)
            for stream in (process.stdout, process.stderr):
                if stream is not None:
                    stream.close()


def run_all(root):
    root = Path(root)
    cases = {}

    def fresh(name, mode="idempotent", enqueue=True):
        path = root / name
        r.initialize(path)
        if enqueue:
            child("enqueue", path, mode=mode)
        return path

    # The sender only sees the absence of a valid acknowledgement. Counts are
    # a test-harness oracle, never information secretly available to recovery.
    for mode, expected in (("naive", 2), ("idempotent", 1)):
        name = mode + "_lost_ack"
        path = fresh(name, mode)
        first = child("dispatch", path, fault="after_receiver_commit", now=0)
        before = r.snapshot(path)
        restarted = child("dispatch", path, now=11)
        after = r.snapshot(path)
        must(first["status"] == "no_ack" and before["sender_state"] == "inflight", name)
        must(before["receiver_tickets"] == 1 and after["receiver_tickets"] == expected, name)
        must(after["sender_state"] == "done" and after["attempts"] == 2, name)
        cases[name] = {"before_restart": before, "after_restart": after, "restart_status": restarted["status"]}

    path = fresh("mark_before_send_loses_task", "mark_before")
    child("dispatch", path, fault="after_mark_before_send", expected_exit=r.CRASH_EXIT)
    restarted = child("dispatch", path, now=11)
    state = r.snapshot(path)
    must(state["sender_state"] == "done" and state["receiver_tickets"] == 0, "premarking loses task")
    cases["mark_before_send_loses_task"] = {"after_restart": state, "restart_status": restarted["status"]}

    for point, rows in (("before_intent_commit", 0), ("after_intent_commit", 1)):
        path = fresh(point, enqueue=False)
        child("enqueue", path, fault=point, expected_exit=r.CRASH_EXIT)
        before = r.snapshot(path)
        must(before["intent_rows"] == rows and before["receiver_tickets"] == 0, point)
        # A caller that received no acceptance retries with its original key.
        child("enqueue", path)
        child("dispatch", path, now=11)
        after = r.snapshot(path)
        must(after["intent_rows"] == 1 and after["receiver_tickets"] == 1, point)
        cases[point] = {"before_retry": before, "after_retry": after}

    for point in ("after_claim", "before_receiver_commit", "after_response_write",
                  "after_response_before_ack", "after_ack"):
        path = fresh(point)
        hard_sender_exit = point in ("after_claim", "after_response_before_ack", "after_ack")
        child("dispatch", path, fault=point, now=0, expected_exit=r.CRASH_EXIT if hard_sender_exit else 0)
        before = r.snapshot(path)
        child("dispatch", path, now=11)
        after = r.snapshot(path)
        must(after["sender_state"] == "done" and after["receiver_tickets"] == 1, point)
        must(after["receiver_receipts"] == 1, point)
        if point in ("after_claim", "before_receiver_commit"):
            must(before["receiver_tickets"] == 0 and before["receiver_receipts"] == 0, point)
        cases[point] = {"before_restart": before, "after_restart": after}

    path = fresh("mismatched_payload")
    child("dispatch", path)
    changed = dict(r.PAYLOAD, body="Different intended work")
    process = r.run_child("receive", path, payload=r.canonical(changed))
    must(process.returncode == 2 and json.loads(process.stderr)["error"] == "Conflict", "key mismatch rejection")
    must(r.snapshot(path)["receiver_tickets"] == 1, "conflict cannot add a ticket")
    cases["mismatched_payload"] = {"rejected": True, "receiver_tickets": 1}

    path = fresh("concurrent_claim")
    claims = concurrent("claim", path, now=0)
    winners = [job for job in claims if job is not None]
    must(len(winners) == 1 and r.snapshot(path)["attempts"] == 1, "only one current lease claimant")
    # Expire the lease, then prove that the first owner's delayed ACK is fenced.
    new_job = r.claim(path, now=11)
    response = r.receive(path, "agent-demo", "op-1", r.PAYLOAD)
    stale_ack = r.acknowledge(path, winners[0], response)
    must(not stale_ack and r.acknowledge(path, new_job, response), "generation fences stale ACK")
    cases["concurrent_claim"] = {"workers": 8, "claim_winners": len(winners), "stale_ack_accepted": stale_ack,
                                  "after_recovery": r.snapshot(path)}

    path = fresh("concurrent_receiver")
    responses = concurrent("receive", path)
    state = r.snapshot(path)
    must(state["receiver_tickets"] == 1 and state["receiver_receipts"] == 1, "receiver race deduplication")
    must(len({r.canonical(response) for response in responses}) == 1, "semantically identical replay results")
    cases["concurrent_receiver"] = {"workers": 8, "receiver_tickets": 1, "receiver_receipts": 1,
                                     "unique_responses": 1}

    for point, expected in (("before_external_effect", 0), ("after_external_effect", 1)):
        path = fresh(point, "external")
        first = child("dispatch", path, fault=point)
        child("dispatch", path, now=11)
        state = r.snapshot(path)
        must(first["status"] == "unknown" and state["sender_state"] == "unknown", point)
        must(state["external_tickets"] == expected and state["attempts"] == 1, point)
        cases[point] = {"after_restart": state, "automatic_retry": False}

    path = fresh("unsafe_external_retry", "external")
    child("dispatch", path, fault="after_external_effect")
    # Intentionally bypass the sender's unknown-state safety policy to expose
    # what an unconditional replay would do. This is NOT a recovery API.
    child("receive", path, mode="external")
    must(r.snapshot(path)["external_tickets"] == 2, "external duplicate baseline")
    cases["unsafe_external_retry"] = {"external_tickets": 2, "policy_bypassed_for_counterexample": True}

    return {"experiment": "agent-reliability-01", "schema_version": 1,
            "measurement_scope": "local synthetic ticket side effects; process exits and restarts; no model or production benchmark",
            "clock": "explicit logical ticks; lease length 10; replay at 11",
            "cases": cases}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="save JSON here, otherwise print to stdout")
    parser.add_argument("--check", type=Path, help="compare observations to checked-in deterministic JSON")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="agent-reliability-") as directory:
        result = run_all(directory)
    if args.check:
        must(result == json.loads(args.check.read_text(encoding="utf-8")), "observed results differ from checked-in JSON")
    output = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")


if __name__ == "__main__":
    main()

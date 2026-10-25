# Fixed-membership durable fan-out join

Python 3.10+ standard library only. No model, network, keys or paid services.
The branch requests and result values are synthetic trusted inputs. SQLite transactions,
child-process exits and gated contention actually execute. This is a join protocol,
not a remote task dispatcher or a general Agent framework.

Save all six files in this directory together, then run:

    python3 test_fanout.py
    python3 run_experiment.py --check
    python3 audit_invariants.py

Unit tests: 26. Frozen experiment: 11 scenario groups, 14 actual os._exit(73)
crash boundaries, and four READY/GO-gated races with 8, 12, 8 and 8 child processes.
The experiment recreates temporary databases and reruns operations before comparison.
Without --check it intentionally replaces results.json; do not use this to hide failures.
Scheduling winners and timings are not frozen performance measurements.
The separately executed audit compares an independent reference model over 40 seeds x 300
operations (12,000 total, 1,456 exact replays) plus 30 x 12 gated processes (360 children).
It checks historical receipts, terminal states and snapshots cannot change.

## Contract

- create(job_id, manifest) atomically persists a nonempty fixed set of up to 32 branches.
  Manifest maps branch ID to request text. Canonical key order is irrelevant; values are bound.
  Same ID/content is replay; changing members or requests conflicts, even after consumption.
- No remote dispatch occurs. A pending branch does not prove the remote work never started.
- report(event_id, job_id, branch_id, outcome, value) accepts trusted unknown/ok/rejected.
  Unknown is nonterminal and has empty value. Pending/unknown can become a terminal outcome.
- The policy is all-settled: wait for all terminal branches; fail if any is rejected.
  One rejection never automatically cancels or resolves other unknown work.
- event_id is globally unique in this database. Same ID/body replays its original receipt;
  changed body conflicts. Unknown-job and unknown-branch receipts persist too.
- New event IDs cannot count one terminal branch twice. Identical terminal value returns
  already_terminal; differing terminal value/state or a later unknown returns terminal_conflict.
- Reconciliation of unknown uses a new event ID; the original unknown receipt stays unresolved.
- Last result, job state, sorted immutable snapshot and event receipt commit atomically.
- consume writes only one synthetic local effect and marks the continuation consumed in
  the same transaction. External effects require a separate idempotency/reconciliation protocol.

## Boundaries

No authentication, tenancy, real remote outcomes, dynamic membership, fail-fast policy,
quorum/voting, automatic retries, leases, task dispatcher, scheduler, wall-clock deadlines,
cancellation, compensation, cross-database atomicity, remote exactly-once, production load
claims, disk/power-loss test, cleanup or capacity budget is implemented.
SQLite permits one writer at a time; busy errors can still surface. The 30-second connection
wait is not a performance guarantee. Each branch/request/receipt ID is trusted; a caller that
lies about results can record false facts. Races prove consistency, not factual truth.
All receipts/jobs/snapshots are retained indefinitely. Per-input size limits do not bound total
storage; even well-formed rejected reports add receipts. Direct DB modification is out of scope.
No attempt ID, lease or fencing is implemented: a trusted upstream must establish that a
report belongs to an eligible execution attempt. The first terminal report is immutable, even
if later corrected; there is no automatic override or manual adjudication interface.
Identifiers: nonempty <=256 UTF-8 bytes. Requests: nonempty <=1024 bytes. Result value: <=1024
bytes (empty allowed); unknown must use empty value. A Python dict has unique keys; decoding
untrusted JSON with duplicate keys is the caller's responsibility, not an implemented gateway.

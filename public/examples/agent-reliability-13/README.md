# Agent reliability 13: durable admission and backlog backpressure

Synthetic teaching model, Python 3.10+ standard library, SQLite. No API key, network,
model call, remote effect, paid service or third-party package is required.
Place all five downloadable files in the same directory:
`admission.py`, `test_admission.py`, `run_experiment.py`, `results.json`, `README.md`.

```sh
python3 test_admission.py
python3 run_experiment.py --check
```

The test suite executes 21 tests, including real subprocess termination (exit 73)
and two twelve-process admission races. The experiment compares 11 scenario groups
with frozen JSON. Concurrent winner identities and wall-clock timings are deliberately
not frozen. `python3 run_experiment.py` regenerates the baseline; review differences,
never regenerate merely to hide a failing check.

## Contract

- `init(path, limits)` persists five immutable positive integer limits.
- `admit(path, id, tenant, payload)` atomically inserts business intent and queued task,
  or returns replay/conflict/oversize/global_full/tenant_full. A rejection stores no ID.
- `claim(path, logical_tick)` returns an ID/generation token; lease is five logical ticks.
- `resolve(path, token, logical_tick)` atomically commits a LOCAL synthetic effect and
  marks done. `quarantine=True` retains admission capacity. This is not proof of a
  remote side effect, authorization or fencing of an external worker.
- `cancel_unstarted` works only on queued generation-zero tasks. `redrive` requires
  matching quarantined generation and preserves the accepted identity and capacity.
- `snapshot` reads one consistent database transaction, not a distributed snapshot.

Active states are queued/inflight/quarantined. Derive their count and exact UTF-8
payload bytes inside the same `BEGIN IMMEDIATE` write transaction that admits work.
Never release on claim, lease expiry, quarantine or redrive. Terminal identity rows
remain for replay detection. They are intentionally not purged and can grow forever.

## Scope and limitations

Inputs are synthetic; OS processes and SQLite transactions/crashes are real. Process
exit is not power-loss/storage durability validation. Payload bytes do not include
Python memory, metadata, SQLite/WAL/index space or an HTTP request buffer. Validate
request size before reading a whole body in a real ingress. Tenant IDs and all calls
are trusted; the sample contains no authentication, authorization, HTTP rate limiter,
automatic retry loop, real clock or multi-node storage implementation. Claims use
FIFO, not series 12 fair scheduling. Quota rejection is not a promise of when to retry.
Generation/tick input validation is bounded at 1e9; indefinite operation and schema
migration/retention/limit changes are not implemented. SELECT aggregation serializes
writers and scans active rows; no production throughput claim is made.

Sources checked 2026-10-21:
- https://www.sqlite.org/lang_transaction.html
- https://www.rabbitmq.com/docs/maxlength
- https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html

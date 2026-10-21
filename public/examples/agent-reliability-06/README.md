# Agent reliability 06: receipt retention and range closure

Download retention.py, test_retention.py, run_experiment.py, results.json and this README into one directory. Python 3.10+; standard library only.

Run:

    python3 test_retention.py
    python3 run_experiment.py --check
    python3 run_experiment.py --output reproduced.json

Observed 2026-10-14: Linux, Python 3.12.14, SQLite 3.53.1. Thirty unittest cases passed. Ten named scenarios were re-executed and the full deterministic result object matched results.json. The harness runs real child processes; os._exit fault points have distinct expected exit codes. READY/GO pipes establish ordering rather than sleeps. Fifteen-second watchdogs are test limits, not measured service deadlines. Windows pipe compatibility is not verified.

The business records are synthetic; SQLite transactions, process exits and recovery are actual executions. No model, network API, credentials or real business data are used. All mutable experiment data is in temporary directories. No third-party package is needed.

## Contract

- Key = (namespace, epoch, operation ID). Payload digest = SHA-256 of exact UTF-8 string; assumes no digest collision. Not JSON canonicalization or authentication.
- Accepted effects and receipt insertions share one BEGIN IMMEDIATE transaction.
- Expiring a result retains a digest tombstone: same payload returns result_expired; changed payload conflicts; neither creates another effect.
- close_and_collect atomically advances a namespace's monotone closed_through and removes receipts in that range. Every execute checks this boundary inside its write transaction before creating effects. Closure rejects ALL requests in the closed range, even legitimate never-seen operations.
- Closure does not undo earlier effects. closed does not prove a particular operation never happened. Results require independent reconciliation after receipt removal.
- Epochs here identify trusted business batches, not worker lease epochs or wall clocks. Reassigning an old intent to a new epoch creates a different key and CAN duplicate business effects. The implementation does not enforce global business uniqueness.
- Callers and close administrators are trusted fixture inputs. No authentication, authorization, namespace/epoch attestation or production epoch allocator is implemented. Forged inputs can bypass intended business binding.
- The boundary must never roll back, including during backup recovery; this example only rejects decreases through its ordinary API. Restoring old snapshots is not tested or prevented.
- The effect table deliberately lacks an operation uniqueness constraint, so receipt deletion's duplicate effect is visible rather than hidden by a second mechanism.

## Scope

WAL and synchronous=FULL on a same-host database; not network storage, multi-service atomicity, power-loss or corruption testing. Explicit cleanup calls model a retention decision, not actual elapsed TTL. Tombstones retain per-operation rows; range closure retains per-namespace state; business effect rows still grow. No storage-size, throughput or cost claims. Test receipt/deletion failures use deliberate SQLite triggers; these are not deployed service logic. The thread test is 16 calls on eight workers with separate connections, not a load benchmark. unsafe_delete appears only in the experiment driver as an intentionally invalid counterexample.

Primary references checked 2026-10-14:
- https://docs.stripe.com/api/idempotent_requests (v1 retention example; no Stripe API calls)
- https://www.sqlite.org/lang_transaction.html
- https://www.sqlite.org/wal.html

Article, original diagrams and code were AI-assisted and execution-checked; no production reliability guarantee.

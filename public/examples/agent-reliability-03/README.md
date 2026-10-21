# Agent reliability 03: unknown outcomes and human reconciliation

Python 3.10+ standard library only. Keep all five files together:

    python3 test_reconciliation.py
    python3 run_experiment.py --check
    python3 run_experiment.py --check results.json --output reproduced.json

`--check` reruns the experiment and compares the entire semantic JSON with the checked-in actual run. There are 38 tests. No credentials, real services, customers, money, or models are involved.

## What actually runs

Sender and receiver use **separate temporary SQLite databases**, with independent transactions. The sender persists `unknown` before spawning a receiver process. The receiver commits an effect and calls `os._exit(23)` before producing any receipt. The sender reopens its durable row and still sees `unknown`. A second sender dispatch for this operation is rejected before invoking the receiver. A direct repeated receiver call would create a second effect: the receiver is genuinely non-idempotent.

`unknown` is intentionally conservative: the sender might crash after recording it but before dispatch. Therefore unknown does not mean the effect happened. The subprocess exit code is a test-harness signal, not receipt evidence that a production client should trust.

For the delayed-original counterexample, another actual subprocess waits for a stdin permit before applying its original write. The parent queries an empty snapshot, performs an unsafe retry, then grants that permit. The original write appears afterward, producing two effects. A second version atomically closes the receiver operation while querying; after permission, the late original is rejected. Pipes establish ordering, without timing sleeps. Process timeouts only bound hung runs.

## Query contract

`classify(snapshot)` returns:

- `duplicate_matches`: more than one match for the operation
- `payload_mismatch`: one match whose payload differs
- `action_scope_mismatch`: one match whose action kind or compensation target differs
- `exact_match_existence_only`: an exact positive from the trusted receiver without complete, authoritative, closed evidence
- `unique_exact_match`: exactly one matching payload in a complete, authoritative snapshot with a no-late-write barrier
- `terminal_absence`: no matches under that same complete, authoritative, closed contract
- `inconclusive`: other empty observations, including incomplete and eventually consistent/non-authoritative negatives

The executable receiver query always reads all locally visible rows. Tests supply conservative metadata flags to exercise incomplete/non-authoritative evidence; this is **not a real replicated or eventually consistent service simulation**. Duplicate/mismatch findings prevent automatic resolution; neither is permission to choose an arbitrary row.

Calling `snapshot(close=True)` is a **receiver mutation**, not a read-only lookup: it can cancel/prevent an original request that is still in flight. Its exact operation and cancellation/closure purpose must be authorized separately from read access. The teaching fixture assumes this authorization; it does not authenticate it. Ordinary reads use the default `close=False`.

The close barrier is an **extra receiver capability**: an atomic `BEGIN IMMEDIATE` transaction inserts the operation in a durable closed set and queries its effects. Every write transaction checks this same closed set before committing. SQLite serializes the two transactions, so an original either commits before close and is included, or is rejected afterward. The close tombstone must remain durable. This is more than an ordinary lookup, and is not available for every real tool. If a real provider cannot prove terminality (including no late writes), an empty query cannot justify retry. The same barrier prevents treating an early single match as final uniqueness before a delayed duplicate arrives.

## Human review and compensation

`reconcile` requires a nonempty reviewer, exact operation and payload scope, a supported evidence verdict, an unknown state, and the expected sender version. It atomically updates the state/version and appends the full evidence snapshot. A stale second reviewer cannot overwrite the first decision or append a misleading success record. Trigger-induced insert failures test that state transitions roll back with failed evidence writes.

A confirmed original may receive an explicit `approve_compensation` record scoped to its exact receiver effect ID, original operation, and expected reconciliation version. Dispatch rechecks that the original remains confirmed at that version. Approval and preparation of the compensation operation commit together. A different effect ID, missing approval, or changed action kind is rejected. The example executes the approved synthetic compensation, loses its receipt too, and leaves **the compensation operation unknown**. Blind retry is blocked. Its effect is a separate ledger entry, not deletion of the original. It models neither a real refund nor a guaranteed reversal of an email or irreversible physical effect.

Reviewer/approver strings, evidence dictionaries, completeness/source flags, payload strings, and local SQLite access are **trusted inputs in this teaching model**, not production authentication, authorization, tamper-proof audit, evidence signing, or a business-specific matching algorithm. Even a non-authoritative positive assumes a genuine trusted receiver record; an untrusted response cannot establish existence. Callers must not expose these APIs as an unauthenticated service. Real implementations must bind canonical full tool arguments and evidence provenance, enforce permissions, and define their business-specific compensation semantics.

`not_applied` ends this local reconciliation flow. The example does not silently reopen a closed operation or automatically issue a replacement; either requires a separately authorized business decision. Likewise the final compensation stays unknown until separately reconciled.

## Limits

This demonstrates a process exit between receiver commit and receipt, not a network partition, power loss, disk corruption, transactional third-party API, or distributed consensus. All writes occur on one host. The tiny synthetic effects and trusted identities are intentionally limited. The checks support these local state-machine claims, not an exactly-once guarantee for arbitrary external tools or production performance claims.

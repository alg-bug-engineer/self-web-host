# Agent reliability 07: state preconditions

Download preconditions.py, test_preconditions.py, run_experiment.py, results.json and this README into one empty directory. Python 3.10+; standard library only.

    python3 test_preconditions.py
    python3 run_experiment.py --check
    python3 run_experiment.py --output reproduced.json

Observed 2026-10-15 on Linux, Python 3.12.14 and SQLite 3.53.1: 31 unittest cases passed. Eleven named scenarios re-created temporary databases, ran actual child processes where specified, and matched the complete deterministic results.json object. No model or real business API was called. Quota transfers are synthetic business fixtures; SQL transactions and process failures are real executions. No timing/performance claim.

## Contract and ordering

The command has exactly src, dst, amount and expected. expected must contain the two distinct resource names and their positive integer revisions. Amount is an integer from 1 to 1,000,000; booleans are rejected. Fingerprints hash deterministic sorted JSON for this restricted format, not arbitrary cross-language canonical JSON. Hash collision resistance is assumed. There is no authentication, authorization, tenant boundary or approval service.

execute opens BEGIN IMMEDIATE and first looks up the operation receipt. Same ID and command returns the historical result; a changed command, including changed expected revisions, conflicts. Only a new operation checks current revisions, validates quota constraints and writes both resources, effect and receipt in the same transaction. A historical result is not a statement about current resource state.

Business rejections (stale, insufficient, missing_resource, revision_exhausted, quota_exhausted) are terminal and recorded. Malformed inputs raise ValueError before recording. Infrastructure exceptions, including lock timeout, are not silently converted to recorded outcomes. The wrapper status completed means a new terminal result was recorded: inspect result.status to distinguish applied from rejection. replayed returns the original result, which can itself be a rejection. conflict never replaces an old receipt.

This deliberately strict policy rejects any change in either resource revision. It can reject plans that would still be acceptable under a weaker balance-only business rule. It does not infer which rule the business actually wants. Replanning requires another decision; changing the expected versions is not the same retry. Do not automatically mint new IDs merely to bypass rejection.

## Boundaries

All participating writers must monotonically increment revisions. change() is a trusted fixture writer; it guards negative/overflow quota and revision exhaustion. The core executor guards destination int64 quota overflow and revision overflow. Direct SQL, deletion/recreation under a reused identity, restoring old snapshots, or resetting revisions can violate the protocol; no defense against these administrative actions is implemented. No resource lifecycle or backup restoration protocol is implemented.

Only the declared two-resource read dependency is checked. A C mutation is intentionally accepted by the executable counterexample. If C mattered to a real decision, that decision's read set was incomplete. There is no general query read-set tracking, phantom/range protection, collection revision, or cross-service snapshot. Stable operation IDs and state revisions do not provide business authorization.

WAL and synchronous=FULL apply to one same-host SQLite file. Transactions do not cover remote email/API effects, other databases or network filesystems. No power-loss, corruption, partition, HTTP/ETag integration or production deployment tests. Pipe READY/GO coordination uses selectors; Windows pipe compatibility is unverified. Fifteen-second timeouts are watchdogs only.

Unsafe code is explicitly named unsafe_checked_then_apply and only invoked by the negative-control harness. It checks versions outside the write transaction, pauses, then writes without rechecking. It is not used by execute. SQLite triggers in tests deliberately fail destination/receipt writes to test rollback, not production business logic.

Two concurrency tests use 16 calls on eight threads, each opening its own connection. One tests competing different IDs sharing the same expected snapshot; the other tests repeated use of the same ID. They are bounded schedule tests, not exhaustive concurrency proofs or load benchmarks. Fault exits 71/72/73 occur after source mutation / before commit / after commit. The saved experiment result records observed exit codes, terminal results and full resource/effect/receipt counts without nondeterministic paths or times.

Receipts are not garbage-collected. Retention and identity lifecycle require their own contract (see chapter 6). The effect table intentionally has no unique operation constraint that would disguise a broken receipt protocol.

## Primary references checked 2026-10-15

- https://www.sqlite.org/lang_transaction.html — SQLite transaction and writer serialization semantics
- https://www.rfc-editor.org/rfc/rfc9110.html#name-if-match — HTTP conditional-request analogy, not an implemented HTTP endpoint

Original article, diagrams and code are AI-assisted and execution-checked. Not a production reliability or authorization guarantee.

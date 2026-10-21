# Agent reliability 08: intent-bound approvals

Download approval.py, test_approval.py, run_experiment.py, results.json and this README into one empty directory. Python 3.10+; standard library only.

    python3 test_approval.py
    python3 run_experiment.py --check
    python3 run_experiment.py --output reproduced.json

Observed 2026-10-16 on Linux, Python 3.12.14 / SQLite 3.53.1: 27 unittest cases pass; all 12 named scenarios recreate their temporary databases and match the full deterministic results.json. Real SQLite transactions, process exits and independent connections; synthetic quota transfers, trusted approval decisions and logical times. No model, real business API, human approval study, authentication or production authorization.

## Protocol

A fixed schema-1 plan has exactly schema, src, dst, amount and expected. Distinct resource names and all identifiers are 1..64 ASCII letters/digits/_/-. expected contains exactly both resource names with positive revisions. Quantity and revisions are integers up to 2**63-1; booleans, floats and extra fields are rejected. Sorted compact JSON plus SHA-256 binds this restricted format, not arbitrary cross-language JSON. Digest collision resistance is assumed. Execute snapshots its validated input before using it.

A trusted grant stores immutable (approval ID, operation ID, digest, canonical plan, expires). The grant fixture performs no identity or authority checks and MUST NOT be exposed to an untrusted caller. IDs and hashes are not credentials. Database writers are trusted. No tenant isolation, signed tokens, protected display channel, policy engine, audit integrity or read authorization exists.

Within one BEGIN IMMEDIATE transaction, execute first reads receipt by operation ID. The same approval ID and digest replays the original terminal result, even after expiry; changed approval or plan conflicts. A new operation checks approval binding, active state and logical time. It consumes approval, evaluates business preconditions, writes any effect and the terminal receipt, then commits all together. Revoke uses the same database write ordering. Approval records cannot be overwritten through grant.

- completed wraps applied, stale, insufficient, missing_resource or overflow. All consume the approval and record a receipt.
- replayed wraps the original result, including rejections; it is not a current-resource snapshot.
- conflict never replaces a receipt.
- approval_missing/mismatch/revoked/expired/consumed are admission failures without a receipt or consumption. A later correctly created approval can admit the previously unrecorded operation.
- Malformed input raises ValueError; infrastructure errors propagate and roll back, rather than becoming a business result.

An approval binds ONE operation ID. Switching IDs, amount, destination or expected versions cannot refresh it. Stale replanning needs a new operation and independently trusted approval. The tests issue that approval explicitly; the execution layer never approves on behalf of a human.

## Failure and concurrency evidence

12 scenarios: changed_intent, operation_binding, expiration_boundary, replay_after_expiry, unsafe_revocation, safe_revocation, after_consume, before_commit, after_commit, stale_replan, concurrent_duplicates and unsafe_blanket_approval.

The two unsafe counterexamples are deliberately separate from execute. Boolean approval permits 4 instead of the approved 3. A child checks active outside its eventual write transaction; parent commits revoke after READY, then sends GO; unsafe child still creates an effect. Safe child begins execute only after that committed revocation and rejects it. READY/GO establishes ordering without sleep. Fifteen-second waits are watchdogs, not latency measurements.

Real child exits after consumption (81), before commit (82), and after commit/before reply (83). Fresh connections observe rollback for 81/82 and persisted effect/receipt for 83; original retries produce one total effect. A test trigger fails receipt insertion and verifies consumption and resource changes roll back. Eight threads with independent connections submit 16 duplicates: 1 completed, 15 replayed, 1 effect. This is a mechanism test, not a load benchmark.

## Important limits

now is a trusted logical admission time supplied by the experiment. At now == expires, new admission is denied. It does not advance during lock waits. This is NOT wall-clock expiry enforcement and does NOT guarantee lock acquisition or commit before a real deadline. A real system must define its expiry boundary and sample trusted time there.

Revocation committed before safe execution prevents it. Execution committed first leaves consumed; subsequent revoke cannot undo the effect. Replay still returns history. Business rejection consumes a processing opportunity, not a promise of successful execution. Transient waiting semantics would require a different explicit approval contract.

WAL and synchronous=FULL, single local SQLite file. No cross-service transaction, power-loss/corruption experiment, backup rollback protocol, receipt retention/cleanup or Windows pipe validation. IDs must not be reused after deleting history. External effects do not roll back with SQLite. No guarantee of natural-language intent completeness: all meaningful execution inputs must be explicitly included in the contract. Do not treat a valid digest as proof a person saw or authorized its content.

## Sources checked 2026-10-16

- https://www.sqlite.org/lang_transaction.html
- https://docs.python.org/3.12/library/json.html
- https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html

These explain transaction ordering, serialization options and content-bound transaction authorization principles. This small example is not an implementation of the OWASP guide's complete security requirements.

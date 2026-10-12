# Agent reliability 04: one deadline, one dispatch budget

Python 3.10+ standard library only. Keep these files together:

- `retry_budget.py`: sequential controller, logical-clock endpoint, real SQLite receiver and commit/cancel harness
- `run_experiment.py`: complete reproducible experiment and JSON checker
- `test_retry_budget.py`: 50 substantive unit/integration checks
- `results.json`: actual output from running the experiment

Run from this directory:

    python3 test_retry_budget.py
    python3 run_experiment.py --check
    python3 run_experiment.py --check results.json --output reproduced.json

To intentionally regenerate the checked artifact after a reviewed behavior change:

    python3 run_experiment.py --output results.json

`--check` reruns all scenarios and compares the **entire semantic JSON** with the saved artifact. It exits nonzero for any mismatch or unreadable artifact. Tests also verify rejection of a deliberately tampered artifact. There are no packages to install, credentials, external services, real customers, financial transactions, or model calls.

## What the numbers mean

All time in the retry controller is an **integer logical tick on a synthetic clock**. These are configured fixture values, not measured milliseconds, network latency, a provider benchmark, or production performance. Actual local Python, subprocess and SQLite operations execute in the persistence section. Their elapsed wall-clock time is intentionally not reported.

Three nested layers (`agent`, `tool`, `sdk`) each permit **two retries**, meaning **three attempts including the first**. If all leaf calls return a retryable failure, the independent retry maxima multiply: `(2 + 1) ** 3 = 27` actual leaf dispatches. Wrapper calls are not themselves tool dispatches.

The faulty `reset_each_layer=True` control deliberately replaces the inherited budget and deadline every time a retry layer is entered. It does not enforce an outer hard timeout. Its advertised local cap of four never binds in a deepest scope that makes at most three calls. Its local 20-tick deadline also never binds in a deepest scope that takes 18 ticks. Parent scopes do not preempt their children. This is a deliberately broken control, **not** a claim that every nested timeout library behaves this way.

The shared version fixes an absolute deadline once, at `operation_start + timeout`, and passes the **same Budget object** through every layer. Every actual endpoint dispatch reserves a token immediately before invocation. The initial dispatch, failed dispatches, ambiguous dispatches and a dispatch interrupted mid-flight each consume one token. Denied dispatches consume none. A `max_dispatches=4` cap means four total calls, or at most three retries after the first; it does not mean four retries.

Actual checked results:

| Scenario | Leaf dispatches | Elapsed logical ticks | Stop/result |
| --- | ---: | ---: | --- |
| Reset per-layer deadline 20 and local cap 4 | 27 | 162 | Retryable failures exhaust layer attempts |
| Shared total cap 4, roomy deadline 1000 | 4 | 24 | Dispatch budget exhausted |
| Shared absolute deadline 20, roomy cap 100 | 4 | 20 | Deadline exceeded |
| Shared cap 4 and absolute deadline 20 | 4 | 20 | Deadline exceeded |
| Shared deadline 14, including nested backoffs | 2 | 14 | Deadline exceeded; 8 ticks spent in backoff |
| Cancellation scheduled at tick 4 | 1 | 4 | Cancelled |
| Unknown non-idempotent call | 1 | 3 | Unsafe retry requires reconciliation |
| Unknown read-only call, then success | 2 | 6 | Success |
| Unknown declared-idempotent call, then success | 2 | 6 | Success, stable key reused |

The deadline-only run dispatches at ticks 0, 6, 12 and 18. The fourth scripted call cooperatively stops at tick 20. No fifth dispatch starts. Backoff spends the same remaining time as work. A depleted shared dispatch cap stops immediately without spending a backoff that cannot lead to a call. The fixture treats completion exactly at the deadline as late, and cancellation wins if both boundaries coincide.

## Deadline and business state are separate

`Outcome.status` and `Outcome.reason` describe control flow. `Outcome.business_state` separately records `not_attempted`, `read_only`, `unknown` or `confirmed`. A controller returning `stopped` does not assert that a remote effect was absent or rolled back. A later token/deadline rejection retains uncertainty from earlier dispatches.

The trace retains the endpoint's observed status/reason even when the controller's deadline supersedes that result. An explicitly unknown late response remains `stopped/deadline_exceeded` with business state `unknown`. A trusted late success can leave the workflow stopped while retaining `confirmed` business evidence and the returned effect ID. That evidence does not extend the workflow deadline or automatically restart execution.

A deadline is not preemption. One test intentionally uses a non-cooperative endpoint that advances directly to tick 99 under a deadline of 10. The controller detects the overrun only when the endpoint returns, records the late evidence and does not retry. Therefore the 20-tick bound applies to the **cooperative scripted endpoint**, not arbitrary blocking Python, an uninterruptible database call, or a remote operation. Production transport/task timeouts and cancellation must be implemented at their actual boundaries; they still cannot undo an already committed effect.

## Retry safety is a separate gate

`may_retry` requires both a retryable outcome (`transient` or `unknown`) and either a read-only request or an explicitly declared receiver-idempotent operation with a stable nonempty key. A “transient” error label does not itself make a non-idempotent mutation safe to replay. Unknown non-idempotent calls stop for reconciliation. Permanent failures, cancellation, deadline and cap exhaustion are not retried.

The request is immutable; every nested retry receives the same payload, operation scope and key. Merely attaching a random key does not declare idempotency, and changing the key makes a new operation. A declared guarantee is a trusted teaching input, **not automatic discovery or authentication** of a third-party API. Real integrations must verify the provider's operation semantics, key scope, payload binding, retention window and retryable-error contract.

## Real SQLite commit, then real process cancellation

`cancel_after_commit` launches a real Python subprocess. The receiver commits its SQLite transaction before printing `COMMITTED_BARRIER`. It then blocks on an IPC gate before it can emit a business receipt. The parent waits for that barrier, terminates the worker without opening the gate, waits for termination, and opens a **new SQLite connection** to count durable rows.

The barrier is privileged **test-harness instrumentation**. It establishes controlled ordering without timing sleeps; it is not a receipt available to the modeled application. The five-second process timeouts only prevent a hung test run. `client_state: unknown` is a label for the modeled caller's missing receipt, not a persisted sender-state implementation or evidence that a real caller can observe a remote commit.

The checked experiment verifies:

- One effect remains after the worker is terminated, despite no business receipt
- The retry policy rejects blind replay for the non-idempotent request
- A separately labeled, deliberately unsafe direct replay produces a second effect
- The receiver-idempotent version replays the same stable key after cancellation and still has exactly one effect
- Reusing that key with changed payload is rejected without another effect
- Deliberately rotating the key creates a second effect

The receiver uses a durable `(operation scope, key)` primary key and binds the exact payload string to an effect ID. The idempotency row and effect are written in one SQLite transaction. A trigger-injected dedup-write failure verifies that the effect rolls back with the failed dedup record. Read-only calls perform only a count query. Every replay opens a fresh connection, so replay does not depend on an in-memory cache.

This is a real **local commit-before-cancellation boundary**, not a network partition, power-loss test, cloud API, remote cancellation acknowledgment, durable orchestrator, or general exactly-once claim. A real remote tool may keep running after the local caller stops. Compensation is a separate authorized business action and is not implemented here.

## Deliberate limits

The retry controller is **sequential only**. It does not implement or test simultaneous retries, hedged requests, fan-out, atomic concurrent token reservation, distributed budgets, persistent budgets across restart, queue admission, fairness, jitter or multi-host clocks. The small reader thread used to receive the subprocess test barrier is not concurrent tool dispatch. Idempotency is demonstrated with serial replay; no race/load test is claimed. The SQLite receiver does serialize its own write transactions, but that does not make the controller's check-and-increment safe to share between threads.

Endpoints are trusted synchronous callables returning an `Outcome`. Arbitrary Python exceptions are not silently converted into retryable failures. Response status and explicit business evidence are trusted inputs in this model; production receipts need appropriate provenance and binding. Fixed synthetic payload strings stand in for full canonical business arguments. No dedup retention/garbage collection is modeled. The implementation is instructional and should not be copied as a complete production agent runtime.

# Durable signals and timeouts: local teaching model

Python 3.10+ standard library only. No keys, model, network, paid service or real user messages.
Business values are synthetic text. SQLite transactions and child processes actually execute.

Save `signals.py`, `test_signals.py`, `run_experiment.py`, `audit_invariants.py`, `results.json`, and this README together.

```sh
python3 test_signals.py
python3 run_experiment.py --check
python3 audit_invariants.py
```

The unit suite has 26 tests. The experiment re-creates temporary databases, verifies 11 scenario groups,
15 `os._exit(73)` crash boundaries, and four groups of eight READY/GO-gated child processes.
`--check` compares reproducible invariants, not OS scheduling winners or performance.
Without `--check`, the experiment intentionally replaces results.json after verification.
Do not replace the baseline to conceal a failure.

## Protocol

- A wait is identified by `(flow, step, generation)`. `open_wait` uses the current generation as a precondition.
- An existing waiting generation cannot be replaced. A terminal generation must have its local continuation consumed before reopening.
- `event_id` is globally unique within one database. The bound body includes flow, step, generation and value; observation time is excluded.
- Unknown/early messages get durable `unknown_wait` receipts. The same ID never becomes accepted just because the wait later appears. New delivery requires a new deliberate event identity, not an automatic retry trick.
- Terminal decision, signal receipt and continuation are one transaction. `now >= deadline` loses, even if no timer worker has run.
- All new timed commands advance a shared logical clock to `max(previous, now)`. An old timestamp cannot reverse a timeout. Exact signal replay/conflict does not advance it.
- `resume` records only a synthetic local effect and consumed bit in one transaction. It does not dispatch emails or any remote action.
- `open_wait` retries after a committed response loss return stale, not an idempotent success receipt. Inspect the exact generation and wait record before choosing a new command.

## Limits

All IDs, timestamps and actions are trusted local inputs, not identity or authorization proof.
Never accept caller-supplied future time from untrusted users: it can expire unrelated waits in this shared logical-clock demo.
There is no real wall-clock source, durable scheduler daemon, fairness, eventual delivery, cross-database transaction,
remote-effect exactly-once guarantee, process lease, production rate limit, data cleanup, schema migration, or power-loss test.
A timeout closes this local wait; it does not revoke a human decision or undo an external effect.
The receipt/continuation history grows indefinitely. The example is not a broker or Temporal implementation.

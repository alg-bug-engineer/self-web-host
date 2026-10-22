# Durable drain barrier — synthetic local experiment

Python 3.10+ standard library only. Download all five files into one fresh directory: drain.py, test_drain.py, run_experiment.py, results.json, README.md.

Run `python3 test_drain.py` (16 tests) and `python3 run_experiment.py --check` (9 scenario groups). No network, model, API keys or external effects. Scripts create and remove temporary SQLite databases; never target a real database. Running the experiment without --check rewrites the reference after review; do not do this merely to hide a failure.

The database stores an open/draining/paused control state and monotonically increasing CAS version. Replay precedes admission closure. Draining keeps existing tasks claimable. Pause requires zero non-done records in the same write transaction. Quarantined and inflight records block pause. A paused state is a local logical barrier, NOT permission for file deletion, schema change, shutdown, deployment or backup. Connections, readers and old processes may remain alive. Another trusted controller may resume immediately; observing a version does not hold an exclusive lock. An external side effect cannot be added between the local steps while preserving this proof.

Real subprocess exits use os._exit(73), not simulated exceptions. Tests cover nine crash boundaries: admission (2), drain (2), local finish (3), pause (2). There are two 12/13-process contention tests. Scheduling-dependent admission counts are deliberately not frozen: the experiment checks all 12 admissions are accounted for, accepted counts match durable outstanding records, and pause succeeds iff empty. No timing or throughput conclusions.

No automatic lease expiry, recovery of dead inflight workers, authentication, bounded admission, durable receipts for control-command replay, storage retention, production retry policy or multi-node protocol. A lost control reply is reconciled by reading current mode/version and deciding whether the desired operation is still applicable; a stale return is not itself proof of success. Explicit resume from draining abandons the drain. Quarantine/requeue are trusted local operator inputs, not authorization flows. Task body and identity are synthetic trusted inputs, not a hardened public API.

Source references checked 2026-10-22: https://www.sqlite.org/lang_transaction.html and https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/ . The latter is background distinction only; this project does not run Kubernetes.

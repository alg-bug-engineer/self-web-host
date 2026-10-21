# Agent reliability 02: leases and fencing

Python 3.10+ standard library only. Save leases.py, run_experiment.py, test_leases.py, results.json, README.md together.

    python3 test_leases.py
    python3 run_experiment.py --check results.json --output reproduced.json

Real spawned processes use Event/Queue handshakes. A commits acquisition then pauses; B acquires at the exact logical expiry tick, writes and exits; A resumes. No sleep is used to manufacture order. Timeout values only bound a hung test; they are not simulated lease durations. Files are temporary synthetic databases.

17 tests include three named scenarios: unfenced receiver, fenced receiver, and expiry-before-receiver-observation gap. The CLI reruns behavior and compares the full semantic JSON, rather than printing a fixture. It should be byte-identical with this implementation. Test discovery, Python multiprocessing spawn, and a writable temporary directory are required.

## Contract and limits

Single trusted authority issues increasing epochs per resource in SQLite BEGIN IMMEDIATE transactions. Receiver compares and writes its stored epoch and synthetic replacement value atomically. This is a single-host executable model, not a production distributed lease service, consensus algorithm, real clock or network-partition test. Logical now ticks are controlled by the experiment, not trusted from arbitrary production clients. Epoch provenance/authentication is assumed. Restoring an old database, resetting epochs, forged higher epochs, or cleaning receiver fence records can break the guarantee.

Sender and receiver tables share one local database for convenience but every operation has its own transaction. They do NOT share one end-to-end transaction; no sender check is consulted during receiver write. The demonstration does not model independent storage/server failures.

A lower epoch is rejected only after receiver has durably observed a higher one. Lease expiration alone does not revoke an old worker at a receiver that does not consult lease authority. Equal epoch/equal value is replay; equal epoch/different value is conflict. This contract allows ONE replacement value per resource/epoch. It is NOT a general tool protocol or stable business operation ID. Multiple actions per tenure need separate operation IDs and explicit sequencing; fencing cannot retract email or ensure exactly-once external effects.

No models, credentials, real customers, third-party APIs, paid services, or production operations are used. The output is mechanism evidence, not a throughput, availability or latency benchmark. WAL and default SQLite synchronization behavior are not power-loss tests.

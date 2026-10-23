"""Independent invariant audit of the local teaching protocol, not a load test.

Run beside versioned.py: python3 audit_invariants.py
The cases use synthetic jobs and local SQLite effects only. A fixed seed fixes
operation choices, not OS process scheduling or concurrent winner identities.
"""
import multiprocessing as mp
import random
import sqlite3
from pathlib import Path
from tempfile import TemporaryDirectory

import versioned as v


def setup(path):
    v.init(path)
    v.register(path, v.V1)
    v.register(path, v.V2)
    assert v.switch(path, 0, v.D1) == 'switched'


def check(path, accepted):
    snapshot = v.snapshot(path)
    for job in snapshot['jobs']:
        assert job['accepted_digest'] == accepted[job['id']]
        effects = [e for e in snapshot['effects'] if e['job_id'] == job['id']]
        assert len(effects) == job['cursor']
        assert [e['step_index'] for e in effects] == list(range(job['cursor']))
        assert all(e['digest'] == job['current_digest'] for e in effects)
        manifest = {v.D1: v.V1, v.D2: v.V2}[job['current_digest']]
        for effect in effects:
            name, amount = manifest['steps'][effect['step_index']]
            assert effect['step_name'] == name
            assert effect['amount'] == (job['units'] if amount == 'units' else amount)
        assert (job['state'] == 'done') == (job['cursor'] == len(manifest['steps']))
        migrations = [m for m in snapshot['migrations'] if m['job_id'] == job['id']]
        assert len(migrations) == job['binding_revision']
        previous = job['accepted_digest']
        for index, migration in enumerate(migrations):
            assert migration['binding_revision'] == index + 1
            assert migration['old_digest'] == previous
            previous = migration['new_digest']
        assert previous == job['current_digest']
    return snapshot


def mixed_operations():
    with TemporaryDirectory() as folder:
        for seed in range(50):
            path = str(Path(folder) / f'{seed}.db')
            setup(path)
            rng = random.Random(seed)
            accepted, tokens = {}, []
            for _ in range(500):
                snapshot = v.snapshot(path)
                action = rng.randrange(7)
                identity = 'job-' + str(rng.randrange(14))
                if action == 0:
                    result = v.admit(path, identity, 1)
                    if result == 'accepted':
                        accepted[identity] = snapshot['route']['digest']
                elif action == 1:
                    revision = snapshot['route']['revision'] + rng.choice([0, 0, -1])
                    v.switch(path, revision, rng.choice([v.D1, v.D2]))
                elif action == 2:
                    token = v.claim(path, rng.choice([[v.V1], [v.V2], [v.V1, v.V2], []]))
                    if token:
                        tokens.append(token)
                elif action == 3 and tokens:
                    v.step(path, rng.choice(tokens), rng.choice([[v.V1], [v.V2], [v.V1, v.V2]]))
                elif action == 4 and snapshot['jobs']:
                    job = rng.choice(snapshot['jobs'])
                    v.recover(path, job['id'], job['generation'] + rng.choice([0, 0, -1]))
                elif action == 5 and snapshot['jobs']:
                    job = rng.choice(snapshot['jobs'])
                    v.migrate(path, job['id'], job['binding_revision'],
                              rng.choice([v.D1, v.D2]), 'synthetic audit change')
                elif identity in accepted:
                    assert v.admit(path, identity, 2) == 'conflict'
                check(path, accepted)
            # This explicit recovery + all-capable worker is a finite test cleanup,
            # not a claim of production liveness under arbitrary future failures.
            for job in v.snapshot(path)['jobs']:
                if job['state'] == 'inflight':
                    v.recover(path, job['id'], job['generation'])
            v.drain(path, [v.V1, v.V2])
            assert all(j['state'] == 'done' for j in check(path, accepted)['jobs'])
    print('PASS: 50 seeds x 500 mixed operations; binding/effect/cursor/audit invariants', flush=True)


def race_worker(path, start, ready, results, operation):
    ready.put('READY')
    if not start.wait(30):
        raise RuntimeError('start barrier timed out')
    try:
        if operation == 'claim':
            result = v.claim(path, [v.V1, v.V2])
        elif operation == 'migrate':
            result = v.migrate(path, 'job', 0, v.D2, 'synthetic audit race')
        else:
            result = v.switch(path, 1, v.D2)
        results.put((operation, result))
    except Exception as error:
        results.put(('error', repr(error)))
        raise


def concurrent_operations():
    context = mp.get_context('spawn')
    with TemporaryDirectory() as folder:
        for iteration in range(40):
            path = str(Path(folder) / f'{iteration}.db')
            setup(path)
            v.admit(path, 'job', 5)
            start, ready, results = context.Event(), context.Queue(), context.Queue()
            processes = [context.Process(target=race_worker,
                         args=(path, start, ready, results, operation))
                         for operation in ['claim', 'migrate', 'switch'] * 4]
            try:
                for process in processes:
                    process.start()
                for _ in processes:
                    assert ready.get(timeout=30) == 'READY'
                start.set()
                outcomes = [results.get(timeout=30) for _ in processes]
                for process in processes:
                    process.join(30)
                    assert process.exitcode == 0
                assert not any(kind == 'error' for kind, _ in outcomes), outcomes
                claims = [value for kind, value in outcomes if kind == 'claim' and value]
                assert len(claims) == 1, outcomes
                assert v.step(path, claims[0], [v.V1, v.V2]) == 'ready'
                binding = v.snapshot(path)['jobs'][0]['binding_revision']
                assert v.migrate(path, 'job', binding, v.D1, 'late change') == 'started'
                v.drain(path, [v.V1, v.V2])
                check(path, {'job': v.D1})
            finally:
                for process in processes:
                    if process.is_alive():
                        process.terminate()
                        process.join()
                for queue in (ready, results):
                    queue.close()
                    queue.join_thread()
    print('PASS: 40 rounds x 12 READY-gated processes; claim/migrate/default-switch races', flush=True)


def corrupted_registry():
    with TemporaryDirectory() as folder:
        path = str(Path(folder) / 'tamper.db')
        setup(path)
        v.admit(path, 'job', 1)
        token = v.claim(path, [v.V1])
        # Direct SQL is outside the trusted protocol. This is a corruption check,
        # not protection from a database administrator with arbitrary write access.
        with sqlite3.connect(path) as db:
            db.execute('UPDATE definition SET body=? WHERE digest=?', (v.canonical(v.V2), v.D1))
        try:
            v.step(path, token, [v.V1])
        except ValueError:
            pass
        else:
            raise AssertionError('corrupted definition executed')
        assert v.snapshot(path)['effects'] == []
    print('PASS: mismatched registry body fails before local effects', flush=True)


if __name__ == '__main__':
    mixed_operations()
    concurrent_operations()
    corrupted_registry()

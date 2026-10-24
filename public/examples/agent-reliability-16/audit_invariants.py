"""Independent synthetic protocol audit; stdlib only, no network or model calls.
Run: python3 audit_invariants.py. Counts are checks, not performance measurements.
"""
import collections
import json
from pathlib import Path
import random
import subprocess
import sys
import tempfile

import signals as api


def key(row):
    return row['flow'], row['step'], row['generation']


def verify(state, previous=None):
    waits = {key(r): r for r in state['waiting']}
    cont = {key(r): r for r in state['continuation']}
    effects = {key(r): r for r in state['effect']}
    receipts = {r['event_id']: r for r in state['receipt']}
    slots = {(r['flow'], r['step']): r['generation'] for r in state['slot']}
    assert set(effects) <= set(cont) <= set(waits)
    assert len(waits) == len(state['waiting'])
    assert len(cont) == len(state['continuation'])
    assert len(effects) == len(state['effect'])
    for k, w in waits.items():
        assert k[:2] in slots and 1 <= k[2] <= slots[k[:2]]
        assert (k in cont) == (w['state'] != 'waiting')
        if k not in cont:
            assert w['event_id'] is None
            continue
        c = cont[k]
        assert c['kind'] == w['state']
        assert c['consumed'] == int(k in effects)
        if k in effects:
            assert effects[k]['kind'] == c['kind'] and effects[k]['value'] == c['value']
        if w['state'] == 'signaled':
            r = receipts[w['event_id']]
            assert r['result'] == 'accepted'
            assert json.loads(r['body']) == [*k, c['value']]
        else:
            assert w['state'] == 'timed_out' and w['event_id'] is None
            assert c['value'] == 'deadline'
    for slot, generation in slots.items():
        assert {k[2] for k in waits if k[:2] == slot} == set(range(1, generation + 1))
        for g in range(1, generation):
            assert cont[(*slot, g)]['consumed'] == 1
    for event, r in receipts.items():
        if r['result'] == 'accepted':
            body = json.loads(r['body'])
            assert waits[tuple(body[:3])]['event_id'] == event
    if previous:
        assert state['clock'][0]['tick'] >= previous['clock'][0]['tick']
        for table, index in [('receipt', lambda r: r['event_id']), ('effect', key)]:
            current = {index(r): r for r in state[table]}
            for r in previous[table]:
                assert current[index(r)] == r
        for w in previous['waiting']:
            now = waits[key(w)]
            assert now['deadline'] == w['deadline']
            if w['state'] != 'waiting':
                assert now == w
        for c in previous['continuation']:
            now = cont[key(c)]
            assert now['kind'] == c['kind'] and now['value'] == c['value']
            assert now['consumed'] >= c['consumed']


def focused(path):
    api.init(path)
    assert api.signal(path, 'early', 'f', 's', 1, 'v', 1)['result'] == 'unknown_wait'
    assert api.open_wait(path, 'f', 's', 0, 10, 1)['result'] == 'opened'
    before = api.snapshot(path)
    assert api.signal(path, 'early', 'f', 's', 1, 'v', 1000) == {'result': 'replay', 'original': 'unknown_wait'}
    assert api.snapshot(path) == before  # A replay cannot move the shared clock.
    assert api.signal(path, 'early', 'f', 's', 1, 'changed', 1000)['result'] == 'conflict'
    assert api.snapshot(path) == before
    assert api.signal(path, 'winner', 'f', 's', 1, 'v', 9)['result'] == 'accepted'
    assert api.open_wait(path, 'f', 's', 1, 20, 9)['result'] == 'pending_continuation'
    assert api.resume(path, 'f', 's', 1) == 'resumed'
    assert api.open_wait(path, 'f', 's', 1, 20, 9)['generation'] == 2
    assert api.signal(path, 'winner', 'f', 's', 2, 'v', 10)['result'] == 'conflict'
    assert api.signal(path, 'old', 'f', 's', 1, 'v', 10)['result'] == 'stale_generation'
    assert api.signal(path, 'boundary', 'f', 's', 2, 'v', 20)['result'] == 'too_late'
    assert api.resume(path, 'f', 's', 2) == 'resumed'
    assert api.resume(path, 'f', 's', 2) == 'replay'
    assert api.open_wait(path, 'other', 's', 0, 30, 20)['result'] == 'opened'
    # Trusted observations from unrelated rejected requests advance the GLOBAL clock.
    assert api.expire(path, 'missing', 's', 1, 30) == 'stale_generation'
    assert api.signal(path, 'backdated', 'other', 's', 1, 'v', 21)['result'] == 'too_late'
    before = api.snapshot(path)
    for invalid in [True, False, -1, 1.5, '1', None, 2**62 + 1]:
        try:
            api.signal(path, 'invalid', 'f', 's', 2, 'v', invalid)
        except ValueError:
            pass
        else:
            raise AssertionError('invalid clock accepted')
        assert api.snapshot(path) == before
    verify(before)


def mixed(directory):
    outcomes = collections.Counter()
    for seed in range(50):
        rng = random.Random(seed)
        path = directory / ('mixed-%d.db' % seed)
        api.init(path)
        state = api.snapshot(path)
        for turn in range(500):
            flow, step = 'f%d' % rng.randrange(3), 's%d' % rng.randrange(2)
            current = next((s['generation'] for s in state['slot'] if s['flow'] == flow and s['step'] == step), 0)
            tick = state['clock'][0]['tick']
            now = max(0, tick + rng.choice([-5, -1, 0, 0, 1, 2]))
            generation = max(1, current + rng.choice([-1, 0, 0, 0, 1]))
            op = rng.choice(['open', 'signal', 'signal', 'expire', 'resume'])
            if op == 'open':
                result = api.open_wait(path, flow, step, max(0, current + rng.choice([-1, 0, 0])), max(0, tick + rng.choice([-1, 1, 4, 12])), now)['result']
            elif op == 'signal':
                event = 'e%d' % rng.randrange(120)
                # Exact receipt retries as well as accidental cross-generation reuse.
                if state['receipt'] and rng.random() < .2:
                    receipt = rng.choice(state['receipt'])
                    event = receipt['event_id']
                    flow, step, generation, value = json.loads(receipt['body'])
                else:
                    value = 'v%d' % rng.randrange(3)
                result = api.signal(path, event, flow, step, generation, value, now)['result']
            elif op == 'expire':
                result = api.expire(path, flow, step, generation, now)
            else:
                result = api.resume(path, flow, step, generation)
            outcomes[op + ':' + result] += 1
            after = api.snapshot(path)
            verify(after, state)
            state = after
    return dict(sorted(outcomes.items()))


def child(path, worker):
    print('READY', flush=True)
    assert sys.stdin.readline().strip() == 'GO'
    if worker < 4:
        result = api.signal(path, 'race-%d' % worker, 'f', 's', 1, 'v', 9)
    elif worker < 8:
        result = api.expire(path, 'f', 's', 1, 10)
    else:
        result = api.resume(path, 'f', 's', 1)
    print(json.dumps(result), flush=True)


def races(directory):
    winners = collections.Counter()
    for round_number in range(40):
        path = directory / ('race-%d.db' % round_number)
        api.init(path)
        api.open_wait(path, 'f', 's', 0, 10, 0)
        children = [subprocess.Popen([sys.executable, __file__, '--child', str(path), str(i)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for i in range(12)]
        try:
            for p in children:
                assert p.stdout.readline().strip() == 'READY'
            for p in children:
                p.stdin.write('GO\n')
                p.stdin.flush()
            for p in children:
                stdout, stderr = p.communicate(timeout=30)
                assert p.returncode == 0, stderr
                json.loads(stdout)
        finally:
            for p in children:
                if p.poll() is None:
                    p.kill()
                    p.wait()
        api.resume(path, 'f', 's', 1)
        state = api.snapshot(path)
        verify(state)
        assert len(state['waiting']) == len(state['continuation']) == len(state['effect']) == 1
        assert len(state['receipt']) == 4
        winners[state['waiting'][0]['state']] += 1
    return dict(sorted(winners.items()))


def main():
    with tempfile.TemporaryDirectory(prefix='signals-independent-audit-') as tmp:
        directory = Path(tmp)
        focused(directory / 'focused.db')
        outcomes = mixed(directory)
        winners = races(directory)
    print(json.dumps({'status': 'pass', 'mixed_seeds': 50, 'operations_per_seed': 500, 'mixed_operations': 25000, 'race_rounds': 40, 'processes_per_race': 12, 'race_processes': 480, 'mixed_outcomes': outcomes, 'race_winners_scheduler_dependent': winners, 'scope': 'synthetic SQLite protocol checks; not network exactly-once, model or production measurements'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == '--child':
        child(sys.argv[2], int(sys.argv[3]))
    else:
        main()

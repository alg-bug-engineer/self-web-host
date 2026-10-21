"""Real SQLite/process execution; all provider billing is synthetic, no network."""
import argparse
import json
import multiprocessing as mp
from pathlib import Path
import tempfile
import budget as b

ARGS = {'query': 'synthetic'}

def reserve(path, op='a', maximum=60, fault=None):
    return b.reserve(path, op, 'demo.search', ARGS, maximum, 'fixed-v1', fault)

def claim(path, op='a', maximum=60, fault=None):
    return b.claim(path, op, 'demo.search', ARGS, maximum, 'fixed-v1', fault)

def fault_worker(path, stage):
    if stage.startswith('reserve'):
        reserve(path, fault=stage)
    elif stage.startswith('claim'):
        claim(path, fault=stage)
    else:
        b.reconcile(path, 'a', 20, 'invoice-a', stage)

def die(path, stage):
    p = mp.get_context('spawn').Process(target=fault_worker, args=(path, stage))
    p.start(); p.join(20)
    if p.is_alive():
        p.kill(); p.join(); raise RuntimeError('child watchdog')
    if p.exitcode != 73:
        raise AssertionError(p.exitcode)
    return p.exitcode

def racer(path, op, barrier, q):
    barrier.wait(15)
    q.put(reserve(path, op, 30))

def race(path):
    ctx = mp.get_context('spawn')
    barrier = ctx.Barrier(8)
    q = ctx.Queue()
    children = [ctx.Process(target=racer, args=(path, str(i), barrier, q)) for i in range(8)]
    for p in children: p.start()
    outcomes = [q.get(timeout=20) for _ in children]
    for p in children:
        p.join(20)
        if p.is_alive(): p.kill(); p.join(); raise RuntimeError('race watchdog')
        assert p.exitcode == 0
    q.close(); q.join_thread()
    return {key: outcomes.count(key) for key in sorted(set(outcomes))}

def experiment():
    out = {}
    with tempfile.TemporaryDirectory() as d:
        def fresh(key):
            path = str(Path(d) / (key + '.db')); b.init(path, 100); return path
        p = fresh('race')
        counts = race(p)
        # Winners vary; record invariant aggregates, not winner IDs.
        out['concurrent_admission'] = {'outcomes': counts, 'exposure_cents': b.snapshot(p)['exposure_cents']}
        out['unsafe_check_then_spend'] = {'observed_balances': [100, 100],
            'each_cost_cents': 60, 'total_cents': 120, 'cap_cents': 100,
            'kind': 'deterministic synthetic interleaving, not provider execution'}
        for stage in ['reserve_before_commit', 'reserve_after_commit',
                      'claim_before_commit', 'claim_after_commit',
                      'settle_before_commit', 'settle_after_commit']:
            p = fresh(stage)
            if not stage.startswith('reserve'): reserve(p)
            if stage.startswith('settle'): claim(p)
            code = die(p, stage)
            out[stage] = {'exit_code': code, 'ledger': b.snapshot(p)}
        p = fresh('unknown'); reserve(p); claim(p)
        out['unknown_keeps_maximum'] = {'retry': reserve(p, 'retry'), 'ledger': b.snapshot(p)}
        p = fresh('settled'); reserve(p); claim(p)
        result = b.reconcile(p, 'a', 20, 'invoice-a')
        out['final_bill_releases_difference'] = {'reconciliation': result,
            'next_admission': reserve(p, 'b', 80), 'ledger': b.snapshot(p)}
        p = fresh('zero'); reserve(p); claim(p)
        out['verified_zero_bill'] = {'reconciliation': b.reconcile(p, 'a', 0, 'invoice-zero'),
                                    'ledger': b.snapshot(p)}
        p = fresh('breach'); reserve(p); claim(p)
        out['provider_bound_violation'] = {'reconciliation': b.reconcile(p, 'a', 120, 'invoice-a'),
            'next_admission': reserve(p, 'b', 1), 'ledger': b.snapshot(p)}
    return out

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--output')
    args = parser.parse_args()
    result = experiment()
    if args.check:
        assert result == json.loads(Path(__file__).with_name('results.json').read_text())
        print(f'{len(result)} scenarios match results.json')
    elif args.output:
        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))

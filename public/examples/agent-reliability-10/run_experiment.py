"""Reproduce normalized outcomes, never timestamps or winning process IDs."""
import argparse
import json
import multiprocessing as mp
import tempfile
from pathlib import Path
from saga import init, reserve, release, snapshot, start, status, step, finish


def crash_child(root, point):
    step(root, 'A', point)


def parallel_child(root, gate, queue):
    gate.wait(timeout=20)
    queue.put(finish(root,'A'))


def report(root):
    return {'phase':status(root,'A')[1], 'stock':snapshot(Path(root)/'stock.db'),
            'slots':snapshot(Path(root)/'slots.db')}


def run():
    results={}
    with tempfile.TemporaryDirectory() as d:
        init(d,10,10); start(d,'A',3); finish(d,'A')
        results['both_reserved']=report(d)
    with tempfile.TemporaryDirectory() as d:
        init(d,10,0); start(d,'A',3); step(d,'A')
        reserve(Path(d)/'stock.db','B',2); finish(d,'A')
        results['compensate_only_own_booking']=report(d)
        before=report(d)
        results['late_forward_and_duplicate_release']={
            'reserve':reserve(Path(d)/'stock.db','A',3),
            'release':release(Path(d)/'stock.db','A',3),
            'unchanged':before==report(d)}
    with tempfile.TemporaryDirectory() as d:
        init(d,10,0); start(d,'A',3); step(d,'A')
        try: step(d,'A','unavailable')
        except TimeoutError: pass
        results['unknown_is_not_rejection']=report(d)
        step(d,'A')
        try: step(d,'A','unavailable')
        except TimeoutError: pass
        results['compensation_unavailable']=report(d)
    ctx=mp.get_context('spawn')
    for i,label in enumerate(('stock','slot','release')):
        for point in ('before_commit','after_commit','coordinator_before_commit','coordinator_after_commit'):
            with tempfile.TemporaryDirectory() as d:
                init(d,10,0); start(d,'A',3)
                for _ in range(i): step(d,'A')
                p=ctx.Process(target=crash_child,args=(d,point)); p.start(); p.join(30)
                if p.exitcode != 73: raise AssertionError(('crash exit',p.exitcode))
                before=report(d); finish(d,'A')
                results['crash_'+label+'_'+point]={'before_recovery':before,'after_recovery':report(d)}
    with tempfile.TemporaryDirectory() as d:
        init(d,10,0); start(d,'A',3); gate=ctx.Barrier(6); queue=ctx.Queue()
        ps=[ctx.Process(target=parallel_child,args=(d,gate,queue)) for _ in range(6)]
        for p in ps: p.start()
        outcomes=[queue.get(timeout=30) for _ in ps]
        for p in ps:
            p.join(30)
            if p.exitcode!=0: raise AssertionError(('worker',p.exitcode))
        results['six_recovery_workers']={'aborted_count':outcomes.count('aborted'),'final':report(d)}
        queue.close(); queue.join_thread()
    # Deliberately wrong arithmetic trace, not external transactions.
    results['unsafe_snapshot_restore']={'initial_free':10,'A_reserves':3,'B_reserves':2,
                                         'free_before_undo':5,'wrong_restored_free':10,'correct_free':8}
    return results


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--check',action='store_true'); parser.add_argument('--output')
    args=parser.parse_args(); result=run(); encoded=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.check:
        expected=json.loads(Path(__file__).with_name('results.json').read_text())
        if result!=expected: raise SystemExit('RESULT MISMATCH')
        print(f'{len(result)} scenarios: exact JSON replay passed')
    elif args.output: Path(args.output).write_text(encoded)
    else: print(encoded,end='')

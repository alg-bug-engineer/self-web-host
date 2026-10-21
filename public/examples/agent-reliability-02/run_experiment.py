"""Real spawned workers, event-controlled order, no sleep-based race or wall-clock benchmark."""
import argparse
import json
import multiprocessing as mp
from pathlib import Path
import tempfile
from leases import acquire, complete, init, snapshot, write

def old_worker(path, ready, resume, output, fenced):
    epoch=acquire(path,'document','A',0)
    output.put(['A_acquire',epoch])
    ready.set()
    if not resume.wait(15): raise TimeoutError('resume missing')
    output.put(['A_write',write(path,'document',epoch,'old',fenced)])
    output.put(['A_complete',complete(path,'document','A',epoch,11,'old')])

def new_worker(path, output, fenced):
    epoch=acquire(path,'document','B',10)
    output.put(['B_acquire',epoch])
    output.put(['B_write',write(path,'document',epoch,'new',fenced)])
    output.put(['B_complete',complete(path,'document','B',epoch,10,'new')])

def join(p):
    p.join(15)
    if p.is_alive(): raise TimeoutError('worker hung')
    if p.exitcode != 0: raise RuntimeError(f'worker exit {p.exitcode}')

def interleaving(path, fenced):
    init(path); ctx=mp.get_context('spawn'); ready=ctx.Event(); resume=ctx.Event(); q=ctx.Queue()
    a=ctx.Process(target=old_worker,args=(path,ready,resume,q,fenced)); b=ctx.Process(target=new_worker,args=(path,q,fenced)); started=[]
    try:
        a.start(); started.append(a)
        if not ready.wait(15): raise TimeoutError('A did not acquire')
        events=[q.get(timeout=15)]
        b.start(); started.append(b); join(b)
        events += [q.get(timeout=15) for _ in range(3)]
        resume.set(); join(a); events += [q.get(timeout=15) for _ in range(2)]
        final=snapshot(path)
        assert events == [['A_acquire',1],['B_acquire',2],['B_write','written'],['B_complete',True],['A_write','stale' if fenced else 'written'],['A_complete',False]]
        assert final['sink'][0]['value'] == ('new' if fenced else 'old')
        assert final['lease'][0]['result'] == 'new'
        return {'events':events,'final':final}
    finally:
        for p in started:
            if p.is_alive(): p.terminate()
            p.join(5)
        q.close(); q.join_thread()

def run():
    with tempfile.TemporaryDirectory() as d:
        result={mode:interleaving(str(Path(d)/(mode+'.db')),mode=='fenced') for mode in ['unfenced','fenced']}
        path=str(Path(d)/'gap.db');init(path)
        a=acquire(path,'document','A',0);b=acquire(path,'document','B',10)
        gap=[write(path,'document',a,'old'),write(path,'document',b,'new'),write(path,'document',a,'old')]
        assert gap == ['written','written','stale']
        result['expiry_gap']={'events':gap,'meaning':'B acquired but receiver had not observed epoch 2; first A write still accepted','final':snapshot(path)}
        return {'schema':1,'scope':'synthetic values; real spawned processes and SQLite; logical ticks; not distributed failover or performance','scenarios':result}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output');p.add_argument('--check');a=p.parse_args();r=run()
    if a.check:
        assert r == json.loads(Path(a.check).read_text()), 'results differ'
    encoded=json.dumps(r,ensure_ascii=False,indent=2)+'\n'
    if a.output: Path(a.output).write_text(encoded)
    else: print(encoded,end='')

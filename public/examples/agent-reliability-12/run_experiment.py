"""Deterministic observations plus real process exits/claims. No runtime benchmark."""
import argparse
import json
import multiprocessing as mp
import tempfile
from pathlib import Path
from fair_relay import init, enqueue, claim, receive, settle, redrive, step, snapshot


def _crash_worker(root, point):
    step(root,0,fault=point)


def _claim_worker(root, gate, out):
    gate.wait(20)
    t=claim(root,0)
    out.put(None if t is None else t['event_id'])


def crash_case(point):
    with tempfile.TemporaryDirectory() as root:
        init(root);enqueue(root,'A1','A')
        p=mp.get_context('spawn').Process(target=_crash_worker,args=(root,point))
        p.start();p.join(20)
        if p.is_alive():
            p.kill();p.join();raise RuntimeError('crash worker watchdog')
        assert p.exitcode==73,(point,p.exitcode)
        before=snapshot(root)
        recovery=step(root,5)
        return {'exitcode':p.exitcode,'before':before,'recovery':recovery,'after':snapshot(root)}


def concurrent_case():
    with tempfile.TemporaryDirectory() as root:
        init(root)
        for flow in 'ABC':
            enqueue(root,flow+'1',flow);enqueue(root,flow+'2',flow)
        ctx=mp.get_context('spawn');gate=ctx.Event();out=ctx.Queue()
        ps=[ctx.Process(target=_claim_worker,args=(root,gate,out)) for _ in range(8)]
        for p in ps:p.start()
        gate.set()
        values=[out.get(timeout=30) for _ in ps]
        for p in ps:
            p.join(20)
            if p.is_alive():p.kill();p.join();raise RuntimeError('claim watchdog')
            assert p.exitcode==0
        return {'claims':sorted(x for x in values if x),'idle':values.count(None),'snapshot':snapshot(root)}


def observations():
    result={}
    with tempfile.TemporaryDirectory() as root:
        init(root)
        for flow in 'ABC':
            for seq in range(1,4):enqueue(root,f'{flow}{seq}',flow)
        result['round_robin']={'steps':[step(root,0) for _ in range(9)],'snapshot':snapshot(root)}
    with tempfile.TemporaryDirectory() as root:
        init(root);enqueue(root,'A1','A',10);enqueue(root,'A2','A');enqueue(root,'B1','B')
        first=step(root,0,max_delta=5);second=step(root,0,max_delta=5);idle=step(root,0)
        before=snapshot(root);t=before['event'][0]
        reopened=redrive(root,'A1',t['generation'],'reviewed decoder limit increase; preserve original event',1)
        recovered=[step(root,1,max_delta=1000),step(root,1,max_delta=1000)]
        result['quarantine_does_not_skip']={'first':first,'second':second,'idle':idle,'before':before,'redrive':reopened,'recovered':recovered,'after':snapshot(root)}
    with tempfile.TemporaryDirectory() as root:
        init(root);enqueue(root,'A1','A');enqueue(root,'B1','B')
        calls=[step(root,0,'unavailable'),step(root,0),step(root,1),step(root,2,'unavailable'),step(root,5),step(root,6,'unavailable')]
        result['backoff_and_budget']={'steps':calls,'snapshot':snapshot(root)}
    with tempfile.TemporaryDirectory() as root:
        init(root);enqueue(root,'A1','A');old=claim(root,0);new=claim(root,5)
        old_delivery=receive(root,old['body']);old_callback=settle(root,old,'accepted',5)
        new_delivery=receive(root,new['body']);new_callback=settle(root,new,new_delivery,5)
        result['late_worker']={'old_delivery':old_delivery,'old_callback':old_callback,'new_delivery':new_delivery,'new_callback':new_callback,'snapshot':snapshot(root)}
    with tempfile.TemporaryDirectory() as root:
        init(root);enqueue(root,'A1','A')
        claims=[claim(root,t) for t in [0,5,10]];none=claim(root,15)
        result['crash_before_send_spends_budget']={'generations':[t['generation'] for t in claims],'next_claim':none,'snapshot':snapshot(root)}
    with tempfile.TemporaryDirectory() as root:
        init(root);enqueue(root,'A1','A');t=claim(root,0)
        delivered=receive(root,t['body']);expired=settle(root,t,delivered,5);retry=step(root,5)
        result['expiry_without_reclaim']={'delivered':delivered,'expired_callback':expired,'retry':retry,'snapshot':snapshot(root)}
    with tempfile.TemporaryDirectory() as root:
        init(root);enqueue(root,'A1','A',10);t=claim(root,0)
        settle(root,t,'unsupported_delta',0);first=redrive(root,'A1',1,'approved local decoder fix',1)
        second=redrive(root,'A1',1,'duplicate operator request',1)
        stale=settle(root,t,'accepted',1)
        result['redrive_compare_and_set']={'first':first,'second':second,'stale':stale,'snapshot':snapshot(root)}
    with tempfile.TemporaryDirectory() as root:
        init(root);enqueue(root,'A1','A');enqueue(root,'B1','B')
        t=claim(root,0);forged=json.loads(t['body']);forged['delta']=2
        receive(root,json.dumps(forged,sort_keys=True,separators=(',',':')))
        conflict=receive(root,t['body']);settle(root,t,conflict,0);b=step(root,0)
        result['identity_conflict_is_not_ack']={'conflict':conflict,'b':b,'snapshot':snapshot(root)}
    # Error baseline: lexical selection never records a failed opportunity.
    result['unsafe_lexical_selection']={'candidates':['A1','B1'],'selected':['A1' for _ in range(4)],'B_selected':False,'kind':'deterministic scheduler-only counterexample; no database effects'}
    for point in ['claim_before_commit','claim_after_commit','receive_before_commit','receive_after_commit','settle_before_commit','settle_after_commit']:
        result['crash_'+point]=crash_case(point)
    result['concurrent_claims']=concurrent_case()
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--output');args=p.parse_args()
    data=observations();encoded=json.dumps(data,ensure_ascii=False,sort_keys=True,indent=2)+'\n'
    if args.check:
        expected=json.loads(Path(__file__).with_name('results.json').read_text())
        assert data==expected,'observations differ from frozen file'
        print(f'{len(data)} scenarios match frozen observations')
    if args.output:Path(args.output).write_text(encoded)
    if not args.check and not args.output:print(encoded,end='')

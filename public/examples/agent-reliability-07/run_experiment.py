"""Deterministic observations from real SQLite and child-process runs."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
from preconditions import init, plan, execute, change, snapshot

ROOT=Path(__file__).resolve().parent

def child(path, command, fault='none', wait=False, unsafe=False):
    args=[sys.executable,str(ROOT/'preconditions.py'),str(path),'job-1',json.dumps(command),'--fault',fault]
    if wait: args.append('--wait')
    if unsafe: args.append('--unsafe')
    proc=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if wait or unsafe:
        try:
            with selectors.DefaultSelector() as selector:
                selector.register(proc.stdout,selectors.EVENT_READ)
                if not selector.select(15): raise TimeoutError('child did not reach barrier')
            if proc.stdout.readline().strip() != 'READY': raise AssertionError('missing READY')
        except BaseException:
            proc.kill(); proc.communicate(); raise
    return proc

def finish(proc, go=False):
    try:
        out,err=proc.communicate('GO\n' if go else None,timeout=15)
    except subprocess.TimeoutExpired:
        proc.kill();proc.communicate();raise
    if err: raise AssertionError(err)
    return {'exit':proc.returncode,'reply':json.loads(out) if out.strip() else None}

def scenarios():
    results={}
    with tempfile.TemporaryDirectory() as tmp:
        def fresh(name):
            path=Path(tmp)/(name+'.db');init(path);return path
        path=fresh('replay');cmd=plan(path)
        results['replay_after_own_write']={'first':execute(path,'job-1',cmd),'retry':execute(path,'job-1',cmd),'state':snapshot(path)}
        for unsafe in (True,False):
            name='unsafe_gap' if unsafe else 'atomic_stale_check'
            path=fresh(name);cmd=plan(path);proc=child(path,cmd,wait=not unsafe,unsafe=unsafe)
            try:
                change(path,'B',2)
                reply=finish(proc,go=True)
            finally:
                if proc.poll() is None: proc.kill();proc.communicate()
            results[name]={'child':reply,'state':snapshot(path)}
        path=fresh('aba');cmd=plan(path);change(path,'A',-1);change(path,'A',1)
        results['aba_same_value_new_revision']={'reply':execute(path,'job-1',cmd),'state':snapshot(path)}
        for fault in ('after_source','before_commit','after_commit'):
            path=fresh(fault);cmd=plan(path);crash=finish(child(path,cmd,fault=fault));before=snapshot(path)
            results[fault]={'child':crash,'before_retry':before,'retry':execute(path,'job-1',cmd),'state':snapshot(path)}
        path=fresh('replan');cmd=plan(path);change(path,'B',1)
        old=execute(path,'job-1',cmd);new=plan(path)
        results['terminal_rejection_and_replan']={'old':old,'old_retry':execute(path,'job-1',cmd),'changed_same_id':execute(path,'job-1',new),'new_id':execute(path,'job-2',new),'state':snapshot(path)}
        path=fresh('race');cmd=plan(path)
        with ThreadPoolExecutor(max_workers=2) as pool:
            replies=list(pool.map(lambda op:execute(path,op,cmd),('job-1','job-2')))
        results['two_plans_one_snapshot']={'statuses':sorted(r['result']['status'] for r in replies),'state':snapshot(path)}
        path=fresh('untracked');cmd=plan(path);change(path,'C',-1)
        results['untracked_dependency_not_protected']={'reply':execute(path,'job-1',cmd),'state':snapshot(path)}
        path=fresh('rejected_crash');cmd=plan(path);change(path,'B',1)
        results['rejection_committed_reply_lost']={'child':finish(child(path,cmd,fault='after_commit')),'retry':execute(path,'job-1',cmd),'state':snapshot(path)}
    return results

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');parser.add_argument('--output',type=Path)
    args=parser.parse_args();data=scenarios()
    if args.check:
        expected=json.loads((ROOT/'results.json').read_text())
        if data != expected: raise SystemExit('FAIL: complete result differs from results.json')
        print(f'PASS: {len(data)} scenarios match complete results.json')
    else:
        text=json.dumps(data,ensure_ascii=False,sort_keys=True,indent=2)+'\n'
        if args.output: args.output.write_text(text)
        else: print(text,end='')

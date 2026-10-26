"""Real temporary SQLite/subprocess experiments; synthetic workload only."""
import argparse
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path
import cancellation as c

HERE = Path(__file__).resolve().parent
OPS = {name: getattr(c,name) for name in ('submit','request_cancel','reserve','report','checkpoint')}


def invoke(db, call, fault=None):
    return OPS[call[0]](db,*call[1:],fault=fault)


def worker(db, call, fault=None, gate=False):
    if gate:
        print('READY',flush=True)
        if sys.stdin.readline().strip() != 'GO':
            raise RuntimeError('missing start gate')
    result = invoke(db,call,fault)
    print(json.dumps(result,ensure_ascii=False),flush=True)


def process(db, call, fault=None, gate=False):
    cmd = [sys.executable,str(HERE/'run_experiment.py'),'--worker',str(db),json.dumps(call)]
    if fault:
        cmd += ['--fault',fault]
    if gate:
        cmd += ['--gate']
    return subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)


def gated(db, calls):
    procs = [process(db,call,gate=True) for call in calls]
    try:
        # All workers have reached the explicit input gate before release.
        # Bounded communicate timeouts below are test-hang guards, not latency measurements.
        import selectors
        selector = selectors.DefaultSelector()
        for p in procs:
            selector.register(p.stdout,selectors.EVENT_READ,p)
        waiting = set(procs)
        while waiting:
            events = selector.select(30)
            if not events:
                raise TimeoutError('worker READY timeout')
            for key,_ in events:
                p = key.data
                line = p.stdout.readline().strip()
                if line != 'READY':
                    raise RuntimeError('worker did not reach gate: '+line)
                selector.unregister(p.stdout); waiting.remove(p)
        selector.close()
        for p in procs:
            p.stdin.write('GO\n'); p.stdin.flush()
        results = []
        for p in procs:
            out,err = p.communicate(timeout=30)
            assert p.returncode == 0, err
            results.append(json.loads(out))
        return results
    finally:
        for p in procs:
            if p.poll() is None:
                p.kill(); p.communicate()


def fixture(db, stage):
    c.init(db)
    if stage in ('submitted','reserved','cancelled_ready','cancelled_reserved'):
        c.submit(db,'j',['a','b'])
    if stage in ('reserved','cancelled_reserved'):
        c.reserve(db,'j')
    if stage in ('cancelled_ready','cancelled_reserved'):
        c.request_cancel(db,'c','j',['a','b'])


def run():
    output = {}
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        def fresh(name,stage='empty'):
            path = root/(name+'.db'); fixture(path,stage); return path
        db = fresh('early')
        assert c.request_cancel(db,'c','j',['a','b'])['result'] == 'cancelled_before_submit'
        assert c.submit(db,'j',['a','b']) == 'blocked_cancelled'
        assert c.submit(db,'j',['different']) == 'conflict'
        assert c.reserve(db,'j')['status'] == 'cancelled'
        output['early_cancel'] = {'same_spec_blocked':True,'different_spec_conflicts':True,'reservations':0}
        c.check_invariants(db)

        db = fresh('late','reserved')
        c.request_cancel(db,'c','j',['a','b'])
        assert c.checkpoint(db,'j') == 'inflight'
        c.report(db,'u','j',0,'unknown')
        assert c.checkpoint(db,'j') == 'inflight'
        c.report(db,'ok','j',0,'ok','synthetic effect kept')
        assert c.checkpoint(db,'j') == 'acknowledged'
        assert c.reserve(db,'j')['status'] == 'cancelled'
        c.check_invariants(db)
        state = c.inspect(db)
        assert [step['state'] for step in state['step']] == ['ok','pending']
        assert (state['job'][0]['control'],state['job'][0]['result']) == ('acknowledged','open')
        output['late_receipt'] = {'unknown_blocks_ack':True,'prefix':['ok','pending'],'result':'open','control':'acknowledged'}

        db = fresh('before')
        c.submit(db,'j',['a']); c.reserve(db,'j'); c.report(db,'ok','j',0,'ok','effect')
        assert c.request_cancel(db,'c','j',['a'])['result'] == 'too_late'
        assert c.inspect(db)['job'][0]['result'] == 'succeeded'
        c.check_invariants(db)
        assert c.inspect(db)['job'][0]['control'] == 'run'
        output['completed_before_cancel'] = {'cancel':'too_late','control':'run','result':'succeeded'}

        db = fresh('after')
        c.submit(db,'j',['a']); c.reserve(db,'j'); c.request_cancel(db,'c','j',['a'])
        c.report(db,'ok','j',0,'ok','effect'); c.checkpoint(db,'j')
        assert (c.inspect(db)['job'][0]['control'],c.inspect(db)['job'][0]['result']) == ('acknowledged','succeeded')
        c.check_invariants(db)
        output['completed_after_cancel'] = {'control':'acknowledged','result':'succeeded','result_not_erased':True}

        db = fresh('reject','reserved')
        c.request_cancel(db,'c','j',['a','b']); c.report(db,'r','j',0,'rejected','trusted no effect')
        assert c.checkpoint(db,'j') == 'acknowledged'
        assert c.inspect(db)['job'][0]['result'] == 'failed'
        c.check_invariants(db)
        output['rejected_after_cancel'] = {'control':'acknowledged','result':'failed','following_step':'pending'}

        db = fresh('receiver','reserved')
        receiver = root/'receiver.db'
        with sqlite3.connect(receiver) as con:
            con.execute('CREATE TABLE effect(job TEXT,seq INTEGER,value TEXT,PRIMARY KEY(job,seq))')
        p = subprocess.run([sys.executable,'-c',
            "import sqlite3,sys,os; d=sqlite3.connect(sys.argv[1]); d.execute('INSERT INTO effect VALUES(?,?,?)',('j',0,'synthetic')); d.commit(); d.close(); os._exit(73)",str(receiver)],timeout=30)
        assert p.returncode == 73
        c.request_cancel(db,'c','j',['a','b'])
        assert c.checkpoint(db,'j') == 'inflight'
        with sqlite3.connect(receiver) as con:
            rows = con.execute('SELECT * FROM effect').fetchall()
        assert rows == [('j',0,'synthetic')]
        c.report(db,'reconcile','j',0,'ok',rows[0][2]); c.checkpoint(db,'j')
        with sqlite3.connect(receiver) as con:
            assert con.execute('SELECT COUNT(*) FROM effect').fetchone()[0] == 1
        c.check_invariants(db)
        assert c.inspect(db)['step'][1]['state'] == 'pending'
        assert c.reserve(db,'j')['status'] == 'cancelled'
        output['receiver_commit_before_lost_receipt'] = {'receiver_exit':73,'effects_before_and_after_ack':1,'next_step_reserved':False}

        db = fresh('receipts','submitted')
        assert c.report(db,'early','j',0,'ok','value')['result'] == 'not_reserved'
        c.reserve(db,'j')
        assert c.report(db,'early','j',0,'ok','value')['result'] == 'not_reserved'
        c.report(db,'u','j',0,'unknown'); c.request_cancel(db,'c','j',['a','b'])
        c.report(db,'ok','j',0,'ok','value'); c.checkpoint(db,'j')
        assert c.report(db,'u','j',0,'unknown')['result'] == 'unresolved'
        assert c.request_cancel(db,'c','j',['a','b'])['result'] == 'requested'
        assert c.report(db,'c','j',0,'ok','value')['result'] == 'event_conflict'
        c.check_invariants(db)
        output['receipt_history'] = {'early_reject_stable':True,'unknown_replay_stable':True,'cancel_replay_stable':True,'cross_type_conflict':True}

        crash_cases = [
            ('submit','empty',['submit','j',['a','b']],['after_job_insert','after_step_insert','before_commit','after_commit']),
            ('tombstone','empty',['request_cancel','c','j',['a','b']],['after_job_insert','after_step_insert','after_receipt_insert','before_commit','after_commit']),
            ('request','submitted',['request_cancel','c','j',['a','b']],['after_cancel_update','after_receipt_insert','before_commit','after_commit']),
            ('reserve','submitted',['reserve','j'],['after_reserve_update','before_commit','after_commit']),
            ('report','cancelled_reserved',['report','r','j',0,'ok','done'],['after_step_update','after_result_update','after_receipt_insert','before_commit','after_commit']),
            ('ack','cancelled_ready',['checkpoint','j'],['after_ack_update','before_commit','after_commit']),
        ]
        crash_results = {}
        for name,stage,call,points in crash_cases:
            reference = fresh('reference-'+name,stage)
            before = c.inspect(reference); invoke(reference,call); after = c.inspect(reference)
            for point in points:
                target = fresh(name+'-'+point,stage)
                p = process(target,call,point)
                out,err = p.communicate(timeout=30)
                assert p.returncode == 73,(name,point,p.returncode,err)
                assert c.inspect(target) == (after if point == 'after_commit' else before),(name,point)
                c.check_invariants(target)
                invoke(target,call)
                assert c.inspect(target) == after,(name,point,'retry')
                c.check_invariants(target)
            crash_results[name] = {'boundaries':len(points),'rollback_or_commit_and_retry_verified':True}
        output['crash_recovery'] = crash_results

        db = fresh('race-submit')
        calls = [['submit','j',['a','b']]]*4 + [['request_cancel','c'+str(i),'j',['a','b']] for i in range(4)]
        gated(db,calls); c.checkpoint(db,'j')
        assert c.inspect(db)['job'][0]['control'] == 'acknowledged'
        assert all(s['state'] == 'pending' for s in c.inspect(db)['step'])
        c.check_invariants(db)
        output['race_submit_cancel'] = {'workers':8,'no_reservation':True,'control':'acknowledged'}

        db = fresh('race-reserve','submitted')
        calls = [['reserve','j']]*4 + [['request_cancel','c'+str(i),'j',['a','b']] for i in range(4)]
        outcomes = gated(db,calls)
        reserved = sum(isinstance(r,dict) and r.get('status') == 'reserved' for r in outcomes)
        assert reserved <= 1
        active = [s for s in c.inspect(db)['step'] if s['state'] == 'inflight']
        assert len(active) == reserved
        assert c.reserve(db,'j')['status'] == 'cancel_requested'
        if active:
            assert c.checkpoint(db,'j') == 'inflight'
            c.report(db,'settle','j',0,'ok','kept')
        c.checkpoint(db,'j'); c.check_invariants(db)
        output['race_reserve_cancel'] = {'workers':8,'at_most_one_prior_reservation':True,'new_reservation_blocked':True,'ack_after_settlement_only':True}

        db = fresh('race-last')
        c.submit(db,'j',['a']); c.reserve(db,'j')
        calls = [['report','r','j',0,'ok','kept']]*4 + [['request_cancel','c'+str(i),'j',['a']] for i in range(4)]
        outcomes = gated(db,calls)
        assert sum(r['delivery'] == 'new' and r['result'] == 'recorded' for r in outcomes) == 1
        c.checkpoint(db,'j'); c.check_invariants(db)
        job = c.inspect(db)['job'][0]
        assert job['result'] == 'succeeded' and job['control'] in ('run','acknowledged')
        output['race_last_result_cancel'] = {'workers':8,'unique_result':True,'success_preserved':True,'legal_control_outcomes':['run','acknowledged']}

        db = fresh('race-ack','cancelled_ready')
        outcomes = gated(db,[['checkpoint','j']]*8)
        assert outcomes.count('acknowledged') == 1 and outcomes.count('replay') == 7
        c.check_invariants(db)
        output['race_checkpoint'] = {'workers':8,'acknowledged':1,'replay':7}
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--worker',nargs=2)
    parser.add_argument('--fault')
    parser.add_argument('--gate',action='store_true')
    args = parser.parse_args()
    if args.worker:
        worker(args.worker[0],json.loads(args.worker[1]),args.fault,args.gate)
        return
    result = run()
    path = HERE/'results.json'
    if args.check:
        assert json.loads(path.read_text()) == result, 'fresh experiment differs from frozen results'
        print(f'PASS: {len(result)} scenario groups match results.json')
    else:
        path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        print(f'WROTE: {len(result)} scenario groups to results.json')


if __name__ == '__main__':
    main()

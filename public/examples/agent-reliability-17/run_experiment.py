"""Actual SQLite/process experiments; freeze invariants, never scheduling winners."""
import argparse
import collections
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import fanout as f

ROOT = Path(__file__).resolve().parent


def run_command(db, spec):
    op = spec['op']
    args = spec.get('args', [])
    return getattr(f, op)(db, *args, fault=spec.get('fault'))


def child(db, spec, gate=False):
    if gate:
        print('READY', flush=True)
        if sys.stdin.readline().strip() != 'GO': raise RuntimeError('gate not opened')
    print(json.dumps(run_command(db, spec)), flush=True)


def process(db, spec):
    return subprocess.run([sys.executable, str(__file__), '--child', str(db), json.dumps(spec)],
                          text=True, capture_output=True, timeout=30)


def parallel(db, specs):
    children = [subprocess.Popen([sys.executable, str(__file__), '--child', str(db), json.dumps(spec), '--gate'],
                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) for spec in specs]
    try:
        for proc in children:
            assert proc.stdout.readline().strip() == 'READY'
        for proc in children:
            proc.stdin.write('GO\n'); proc.stdin.flush()
        outputs=[]
        for proc in children:
            stdout,stderr=proc.communicate(timeout=40)
            assert proc.returncode == 0, stderr
            outputs.append(json.loads(stdout))
        return outputs
    finally:
        for proc in children:
            if proc.poll() is None: proc.kill(); proc.wait()


def spec(op, *args, fault=None):
    return {'op':op, 'args':list(args), 'fault':fault}


def experiments():
    result={}
    with tempfile.TemporaryDirectory() as folder:
        root=Path(folder)
        def fresh(name):
            db=root/(name+'.db'); f.init(db); return db
        db=fresh('restart')
        assert process(db,spec('create','j',{'a':'lookup A','b':'lookup B'})).returncode==0
        assert process(db,spec('report','one','j','a','ok','A')).returncode==0
        assert process(db,spec('report','two','j','b','ok','B')).returncode==0
        assert process(db,spec('consume','j')).returncode==0
        assert f.check_invariants(db)
        result['restart']={'state':f.inspect(db)['job'][0]['state'],'effects':len(f.inspect(db)['effect'])}
        db=fresh('duplicates'); f.create(db,'j',{'a':'A','b':'B'})
        replies=[f.report(db,'e'+str(i),'j','a','ok','A')['result'] for i in range(5)]
        assert f.inspect(db)['job'][0]['state']=='open'
        result['duplicates']={'replies':replies,'distinct_terminal_branches':1,'join':'open'}
        # Two intentionally wrong algorithms, no claim these are deployed frameworks.
        arrivals=['a','a']; members=['a','b']
        assert len(arrivals)==len(members) and set(arrivals)!=set(members)
        current_members={'a'}; terminal={'a'}
        premature=terminal==current_members
        current_members.add('b')
        assert premature and terminal!=current_members
        result['counterexamples']={'raw_counter_premature':True,'mutable_membership_premature':True}
        db=fresh('unknown'); f.create(db,'j',{'a':'A','b':'B'})
        f.report(db,'ea','j','a','rejected','missing'); f.report(db,'eb','j','b','unknown','')
        assert f.inspect(db)['job'][0]['state']=='open'
        conflict=f.report(db,'eb','j','b','ok','B')['result']
        assert conflict=='event_conflict'
        f.report(db,'reconciled','j','b','ok','B')
        assert f.inspect(db)['job'][0]['state']=='failed'
        result['unknown_then_reconciliation']={'before':'open','rewrite_same_event':conflict,'after':'failed'}
        db=fresh('early')
        old=f.report(db,'early','j','a','ok','A')['result']; f.create(db,'j',{'a':'A'})
        retry=f.report(db,'early','j','a','ok','A')
        assert old==retry['result']=='unknown_job' and f.inspect(db)['job'][0]['state']=='open'
        result['early_receipt']={'first':old,'retry':retry,'join':'open'}
        crash_counts={}
        cases={
          'create':['after_job_insert','after_branch_insert','before_commit','after_commit'],
          'report':['after_branch_update','after_join_update','after_continuation_insert','after_receipt_insert','before_commit','after_commit'],
          'consume':['after_effect_insert','after_consume_update','before_commit','after_commit']}
        for op,points in cases.items():
            for point in points:
                db=fresh(op+'-'+point)
                if op!='create': f.create(db,'j',{'a':'A'})
                if op=='consume': f.report(db,'e','j','a','ok','A')
                command={'create':spec('create','j',{'a':'A','b':'B'},fault=point),
                         'report':spec('report','e','j','a','ok','A',fault=point),
                         'consume':spec('consume','j',fault=point)}[op]
                proc=process(db,command); assert proc.returncode==73,(op,point,proc.stderr)
                view=f.inspect(db); committed=point=='after_commit'
                if op=='create': assert bool(view['job'])==committed
                elif op=='report':
                    assert (view['job'][0]['state']=='succeeded')==committed
                    assert bool(view['receipt'])==committed
                else: assert bool(view['effect'])==committed
                assert f.check_invariants(db)
                command['fault']=None; run_command(db,command)
                assert f.check_invariants(db)
            crash_counts[op]=len(points)
        result['crash_boundaries']=crash_counts
        db=fresh('race-create')
        outputs=parallel(db,[spec('create','j',{'a':'A'})]*8)
        counts=dict(collections.Counter(outputs)); assert counts=={'created':1,'replay':7}
        result['create_race']=counts
        db=fresh('race-report'); f.create(db,'j',{str(i):'request'+str(i) for i in range(4)})
        outputs=parallel(db,[spec('report',f'e{i}-{copy}','j',str(i),'ok',str(i)) for i in range(4) for copy in range(3)])
        counts=dict(collections.Counter(x['result'] for x in outputs))
        assert counts=={'recorded':4,'already_terminal':8}
        assert len(f.inspect(db)['continuation'])==1 and f.check_invariants(db)
        result['result_race']={**counts,'continuations':1}
        outputs=parallel(db,[spec('consume','j')]*8)
        counts=dict(collections.Counter(outputs)); assert counts=={'consumed':1,'replay':7}
        assert f.check_invariants(db); result['consume_race']=counts
        db=fresh('race-conflict'); f.create(db,'j',{'a':'A'})
        outputs=parallel(db,[spec('report',f'e{i}','j','a',('ok' if i%2 else 'rejected'),('A' if i%2 else 'B')) for i in range(8)])
        counts=dict(collections.Counter(x['result'] for x in outputs))
        assert counts=={'recorded':1,'already_terminal':3,'terminal_conflict':4}
        assert f.check_invariants(db)
        result['conflicting_terminal_race']={**counts,'unique_snapshot':len(f.inspect(db)['continuation'])}
        db=fresh('snapshot'); f.create(db,'j',{'b':'B','a':'A'})
        f.report(db,'b','j','b','ok','B'); f.report(db,'a','j','a','ok','A'); f.consume(db,'j')
        view=f.inspect(db); assert view['effect'][0]['snapshot']==view['continuation'][0]['snapshot']
        result['snapshot']={'order':[x['id'] for x in json.loads(view['effect'][0]['snapshot'])],'effects':1}
    return result


if __name__=='__main__':
    if '--child' in sys.argv:
        index=sys.argv.index('--child'); child(Path(sys.argv[index+1]),json.loads(sys.argv[index+2]),'--gate' in sys.argv)
    else:
        parser=argparse.ArgumentParser(); parser.add_argument('--check',action='store_true'); args=parser.parse_args()
        actual=experiments(); frozen=ROOT/'results.json'
        if args.check:
            assert actual==json.loads(frozen.read_text()), 'Results differ; investigate, do not silently replace baseline'
            print(f'PASS: {len(actual)} scenario groups match results.json')
        else:
            frozen.write_text(json.dumps(actual,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
            print(f'WROTE: {len(actual)} verified scenario groups')

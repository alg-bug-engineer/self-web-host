"""Re-run local processes and compare invariants, not nondeterministic schedules."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import versioned as v

HERE = Path(__file__).resolve().parent


def setup(path):
    v.init(path)
    v.register(path,v.V1)
    v.register(path,v.V2)
    assert v.switch(path,0,v.D1) == 'switched'


def invoke(op, args):
    return getattr(v,op)(*args)


def exit_at(op,args):
    p = subprocess.run([sys.executable,str(Path(__file__).resolve()),'--worker',op,json.dumps(args)],
                       input='GO\n',capture_output=True,text=True,timeout=20)
    assert p.returncode == 73, (p.returncode,p.stdout,p.stderr)


def race(operations):
    ps = [subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--worker',op,json.dumps(args)],
                          stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
          for op,args in operations]
    try:
        for p in ps:
            assert p.stdout.readline().strip() == 'READY'
        for p in ps:
            p.stdin.write('GO\n')
            p.stdin.flush()
        results=[]
        for p in ps:
            out,err=p.communicate(timeout=20)
            assert p.returncode == 0, err
            results.append(json.loads(out))
        return results
    finally:
        for p in ps:
            if p.poll() is None:
                p.kill()
                p.wait()


def total(s,identity):
    return sum(e['amount'] for e in s['effects'] if e['job_id']==identity)


def scenarios():
    out={}
    with TemporaryDirectory() as folder:
        def fresh(name):
            p=str(Path(folder)/(name+'.db'))
            setup(p)
            return p

        p=fresh('pin')
        v.admit(p,'old',10)
        token=v.claim(p,[v.V1]); v.step(p,token,[v.V1])
        v.switch(p,1,v.D2); v.admit(p,'new',10)
        no_old=v.claim(p,[v.V2])
        assert no_old[0]=='new'
        v.step(p,no_old,[v.V2]); v.drain(p,[v.V2])
        blocked=v.snapshot(p)
        assert blocked['unfinished_by_definition']=={v.D1:1}
        final=v.drain(p,[v.V1])
        out['pin_across_upgrade']={'old_total':total(final,'old'),'new_total':total(final,'new'),
                                 'old_waited_for_capable_worker':True,'old_effects_same_definition':
                                 all(e['digest']==v.D1 for e in final['effects'] if e['job_id']=='old')}

        # Deliberately unsafe positional resume: v1 step0 + v2 step1.
        value=lambda step: 10 if step[1]=='units' else step[1]
        naive=value(v.V1['steps'][0])+value(v.V2['steps'][1])
        v1_total=sum(map(value,v.V1['steps']))
        v2_total=sum(map(value,v.V2['steps']))
        out['unsafe_current_pointer']={'hybrid_total':naive,'v1_total':v1_total,'v2_total':v2_total,
                                      'matches_neither_contract':naive not in (v1_total,v2_total)}

        p=fresh('replay')
        v.admit(p,'a',10); v.switch(p,1,v.D2)
        result=v.admit(p,'a',10); conflict=v.admit(p,'a',11)
        out['identity_replay']={'result':result,'different_input':conflict,
                                'original_binding_kept':v.snapshot(p)['jobs'][0]['current_digest']==v.D1}

        crashes={}
        for fault in ('after_effect','before_commit','after_commit'):
            p=fresh('step_'+fault); v.admit(p,'a',10)
            token=v.claim(p,[v.V1]); exit_at('step',[p,token,[v.V1],fault])
            s=v.snapshot(p)
            before=len(s['effects'])
            stale=None
            if fault!='after_commit':
                assert v.recover(p,'a',token[2])=='recovered'
                stale=v.step(p,token,[v.V1])
            v.switch(p,1,v.D2)
            final=v.drain(p,[v.V1,v.V2])
            crashes[fault]={'effects_before_recovery':before,'old_callback':stale,
                            'final_total':total(final,'a'),'effect_count':len(final['effects'])}
        out['process_exit_step']=crashes

        route_exits={}
        for fault in ('before_commit','after_commit'):
            p=fresh('route_'+fault); exit_at('switch',[p,1,v.D2,fault]); v.init(p)
            s=v.snapshot(p)
            route_exits[fault]={'revision':s['route']['revision'],'uses_v2':s['route']['digest']==v.D2}
        out['process_exit_route']=route_exits

        migrations={}
        for fault in ('after_audit','before_commit','after_commit'):
            p=fresh('migration_'+fault); v.admit(p,'a',10)
            exit_at('migrate',[p,'a',0,v.D2,'synthetic operator decision',fault])
            s=v.snapshot(p)
            migrations[fault]={'audit_count':len(s['migrations']),'binding_revision':s['jobs'][0]['binding_revision'],
                              'new_binding':s['jobs'][0]['current_digest']==v.D2}
        out['process_exit_migration']=migrations

        p=fresh('explicit'); v.admit(p,'a',10)
        migrated=v.migrate(p,'a',0,v.D2,'synthetic approved semantic change')
        stale=v.migrate(p,'a',0,v.D1,'late change')
        replay=v.admit(p,'a',10)
        s=v.drain(p,[v.V2])
        out['explicit_unstarted_migration']={'result':migrated,'late_request':stale,'admit_replay':replay,
                'accepted_definition_preserved':s['jobs'][0]['accepted_digest']==v.D1,
                'audit_count':len(s['migrations']),'final_total':total(s,'a')}

        p=fresh('partial'); v.admit(p,'a',10); t=v.claim(p,[v.V1])
        running=v.migrate(p,'a',0,v.D2,'not allowed')
        v.step(p,t,[v.V1]); partial=v.migrate(p,'a',0,v.D2,'also not allowed')
        s=v.drain(p,[v.V1]); done=v.migrate(p,'a',0,v.D2,'not allowed either')
        out['migration_boundaries']={'inflight':running,'partial_ready':partial,'done':done,'final_total':total(s,'a')}

        p=fresh('route_race')
        results=race([('switch',[p,1,v.D2]) for _ in range(8)])
        out['concurrent_route_change']={'one_switch':results.count('switched')==1,
                                       'seven_stale':results.count('stale')==7,
                                       'revision':v.snapshot(p)['route']['revision']}

        p=fresh('claim_migrate'); v.admit(p,'a',10)
        results=race([('claim',[p,[v.V1]]),('migrate',[p,'a',0,v.D2,'synthetic race'])])
        token,migration=results
        s=v.snapshot(p); row=s['jobs'][0]
        valid=(token is None and migration=='migrated' and row['current_digest']==v.D2 and row['state']=='ready') or \
              (token is not None and migration=='started' and row['current_digest']==v.D1 and row['state']=='inflight')
        assert valid, results
        if token:
            v.step(p,token,[v.V1])
        final=v.drain(p,[v.V1,v.V2])
        out['concurrent_claim_migrate']={'serializable_outcome':valid,'audit_matches_binding':
                    len(final['migrations'])==(1 if final['jobs'][0]['current_digest']==v.D2 else 0),
                    'no_mixed_definition':len({e['digest'] for e in final['effects']})==1,
                    'exactly_two_local_effects':len(final['effects'])==2}
    return out


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    parser.add_argument('--worker',nargs=2)
    args=parser.parse_args()
    if args.worker:
        print('READY',flush=True)
        if sys.stdin.readline().strip()!='GO':
            raise RuntimeError('missing GO')
        print(json.dumps(invoke(args.worker[0],json.loads(args.worker[1]))),flush=True)
        return
    actual=scenarios()
    target=HERE/'results.json'
    if args.check:
        assert actual==json.loads(target.read_text()), json.dumps(actual,indent=2)
        print(f'PASS: {len(actual)} scenario groups match results.json')
    else:
        target.write_text(json.dumps(actual,ensure_ascii=False,indent=2)+'\n')
        print(f'Wrote {len(actual)} actual scenario groups')


if __name__=='__main__':
    main()

"""Deterministic summaries of synthetic fixtures; never a throughput benchmark."""
import argparse
from collections import Counter
import json
from pathlib import Path
import tempfile

import admission as a
from test_admission import child, contention


def run():
    out = {}
    with tempfile.TemporaryDirectory() as folder:
        root=Path(folder)
        def fresh(name):
            p=root/(name+'.db'); a.init(p); return p
        p=fresh('replay')
        statuses=[a.admit(p,'a1','a','x'),a.admit(p,'a2','a','x'),
                  a.admit(p,'a3','a','x'),a.admit(p,'a1','a','x'),a.admit(p,'a1','a','y')]
        out['full_replay_conflict']=dict(statuses=statuses,usage=a.snapshot(p)['usage'])
        p=fresh('utf8')
        out['utf8_budget']=dict(statuses=[a.admit(p,'a','t','中'*30),a.admit(p,'b','t','文'*13)],usage=a.snapshot(p)['usage'])
        p=fresh('global_bytes')
        statuses=[a.admit(p,str(i),str(i),'x'*96) for i in range(2)]
        statuses.append(a.admit(p,'c','c','x'*65))
        out['global_bytes']=dict(statuses=statuses,usage=a.snapshot(p)['usage'])
        for scope,tenants in [('global',[str(i) for i in range(12)]),('tenant',['a']*12)]:
            p=fresh(scope)
            out['concurrent_'+scope]=dict(processes=12,status_counts=dict(sorted(Counter(contention(p,tenants)).items())),usage=a.snapshot(p)['usage'])
        p=fresh('lifecycle'); a.admit(p,'one','a','abc')
        old=a.claim(p,0)
        expired=a.resolve(p,old,5)
        fresh_token=a.claim(p,5)
        stale=a.resolve(p,old,5)
        quarantined=a.resolve(p,fresh_token,6,True)
        held=a.snapshot(p)['usage']
        redrive=a.redrive(p,'one',fresh_token['generation'])
        cancel=a.cancel_unstarted(p,'one')
        current=a.claim(p,7)
        done=a.resolve(p,current,8)
        duplicate=a.resolve(p,current,8)
        out['capacity_lifecycle']=dict(statuses=[expired,stale,quarantined,redrive,cancel,done,duplicate],held=held,final=a.snapshot(p))
        p=fresh('retry'); a.admit(p,'one','a','x'); a.admit(p,'two','a','x')
        refused=a.admit(p,'three','a','old')
        cancelled=a.cancel_unstarted(p,'one')
        retry=a.admit(p,'three','a','changed')
        out['denial_not_acceptance']=dict(statuses=[refused,cancelled,retry],usage=a.snapshot(p)['usage'],intents=a.snapshot(p)['intents'])
        out['admission_crashes']=[]
        for point in ['between_intent_task','before_admit_commit','after_admit_commit']:
            p=fresh(point)
            result=child(p,f'a.admit(p,"one","a","abc",fault={point!r})')
            out['admission_crashes'].append(dict(point=point,exit_code=result.returncode,snapshot=a.snapshot(p),retry=a.admit(p,'one','a','abc')))
        out['resolution_crashes']=[]
        for point in ['between_effect_done','before_resolve_commit','after_resolve_commit']:
            p=fresh(point); a.admit(p,'one','a','abc'); token=a.claim(p,0)
            result=child(p,f'a.resolve(p,{token!r},1,fault={point!r})')
            out['resolution_crashes'].append(dict(point=point,exit_code=result.returncode,snapshot=a.snapshot(p)))
        out['cancellation_crashes']=[]
        for point in ['before_cancel_commit','after_cancel_commit']:
            p=fresh(point); a.admit(p,'one','a','abc')
            result=child(p,f'a.cancel_unstarted(p,"one",fault={point!r})')
            out['cancellation_crashes'].append(dict(point=point,exit_code=result.returncode,snapshot=a.snapshot(p)))
        p=fresh('history')
        for i in range(10):
            a.admit(p,str(i),'a','x'); token=a.claim(p,i*2); a.resolve(p,token,i*2+1)
        snap=a.snapshot(p)
        out['terminal_history_counterexample']=dict(active=snap['usage'],retained_intents=snap['intents'],effects=snap['effects'])
    return dict(kind='synthetic fixtures; actual local SQLite/subprocess execution',limits=a.DEFAULT,scenarios=out)


if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--check', action='store_true'); args=parser.parse_args()
    result=run(); target=Path(__file__).with_name('results.json')
    if args.check:
        expected=json.loads(target.read_text(encoding='utf-8'))
        if result != expected:
            raise SystemExit('FAIL: actual result differs from committed results.json')
        print(f'PASS: {len(result["scenarios"])} scenario groups match results.json')
    else:
        target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(f'Wrote {target.name}: {len(result["scenarios"])} scenario groups')

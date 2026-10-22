"""Re-run complete synthetic scenarios, including real subprocess crashes."""
import json
from pathlib import Path
import sys
import tempfile
import drain as d
from test_drain import child, race

HERE=Path(__file__).resolve().parent


def run():
    result={}
    with tempfile.TemporaryDirectory() as tmp:
        counter=0
        def fresh():
            nonlocal counter
            counter+=1; p=Path(tmp)/f'{counter}.db'; d.init(p); return p
        p=fresh(); d.admit(p,'a','x'); d.transition(p,0,'drain')
        result['normal']=[d.admit(p,'b','x'),d.admit(p,'a','x'),d.transition(p,1,'pause')]
        t=d.claim(p); result['normal'] += [d.finish(p,t),d.transition(p,1,'pause'),d.finish(p,t),d.admit(p,'a','x')]
        result['normal']={'responses':result['normal'],'snapshot':d.snapshot(p)}
        p=fresh(); d.admit(p,'a','x'); t=d.claim(p); d.quarantine(p,t); d.transition(p,0,'drain')
        result['quarantine']=[d.transition(p,1,'pause'),d.requeue(p,'a')]
        t2=d.claim(p); result['quarantine'] += [d.finish(p,t),d.finish(p,t2),d.transition(p,1,'pause')]
        p=fresh(); d.transition(p,0,'drain'); d.transition(p,1,'resume'); d.transition(p,2,'drain')
        result['stale_controller']=[d.transition(p,1,'resume'),d.snapshot(p)]
        control=[]
        for point in ['before_commit','after_commit']:
            p=fresh(); r=child(p,"d.transition(p,0,'drain',"+repr(point)+")")
            assert r.returncode==73
            d.init(p); control.append({'point':point,'exit':r.returncode,'snapshot':d.snapshot(p)})
        result['control_crashes']=control
        admissions=[]
        pauses=[]
        for point in ['before_commit','after_commit']:
            p=fresh(); r=child(p,"d.admit(p,'a','x',"+repr(point)+")"); assert r.returncode==73
            d.transition(p,0,'drain')
            admissions.append({'point':point,'retry':d.admit(p,'a','x'),'snapshot':d.snapshot(p)})
            p=fresh(); d.transition(p,0,'drain')
            r=child(p,"d.transition(p,1,'pause',"+repr(point)+")"); assert r.returncode==73
            pauses.append({'point':point,'snapshot':d.snapshot(p)})
        result['admission_crashes']=admissions
        result['pause_crashes']=pauses
        finishes=[]
        for point in ['after_effect','before_commit','after_commit']:
            p=fresh(); d.admit(p,'a','x'); t=d.claim(p); d.transition(p,0,'drain')
            r=child(p,'d.finish(p,'+repr(t)+','+repr(point)+')'); assert r.returncode==73
            finishes.append({'point':point,'exit':r.returncode,'pause':d.transition(p,1,'pause'),'snapshot':d.snapshot(p)})
        result['finish_crashes']=finishes
        p=fresh(); out=race(p,["d.transition(p,0,'drain')"]*12)
        result['controllers']={x:out.count(x) for x in sorted(set(out))}
        # Scheduling changes winner identities and counts. Freeze invariant truth,
        # not a fabricated repeatable admission count or latency measurement.
        p=fresh(); out=race(p,["d.admit(p,'r%d','x')"%i for i in range(12)]+["d.transition(p,0,'drain')"])
        accepted=out.count('accepted'); s=d.snapshot(p)
        result['admission_race']={'twelve_accounted':accepted+out.count('closed')==12,
            'one_drain':out.count('draining')==1,'accepted_matches_durable':accepted==s['outstanding'],
            'late_closed':d.admit(p,'late','x')=='closed',
            'pause_iff_empty':d.transition(p,1,'pause')==('busy' if accepted else 'paused')}
        assert all(result['admission_race'].values())
    return result

if __name__=='__main__':
    actual=run(); target=HERE/'results.json'
    if sys.argv[1:]==['--check']:
        assert actual==json.loads(target.read_text()), json.dumps(actual,ensure_ascii=False,indent=2)
        print(f'PASS: {len(actual)} scenario groups match results.json')
    elif sys.argv[1:]:
        raise SystemExit('usage: python3 run_experiment.py [--check]')
    else:
        target.write_text(json.dumps(actual,ensure_ascii=False,indent=2)+'\n')
        print(f'Wrote {len(actual)} scenario groups to results.json')

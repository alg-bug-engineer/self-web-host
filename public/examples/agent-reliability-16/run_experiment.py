"""Real process exits and READY/GO contention; synthetic domain and logical time."""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
import signals as s

HERE=Path(__file__).resolve().parent


def invoke(path,op,args,fault=None):
    return getattr(s,op)(path,*args,**({'fault':fault} if fault else {}))


def child(path,op,args,fault=None):
    return subprocess.run([sys.executable,str(__file__),'--child',str(path),op,json.dumps(args),fault or ''],capture_output=True,text=True,timeout=30)


def race(path,commands):
    ps=[subprocess.Popen([sys.executable,str(__file__),'--gate',str(path),op,json.dumps(args)],
                        stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for op,args in commands]
    try:
        for p in ps: assert p.stdout.readline().strip()=='READY'
        for p in ps: p.stdin.write('GO\n'); p.stdin.flush()
        results=[]
        for p in ps:
            out,err=p.communicate(timeout=30)
            assert p.returncode==0,(out,err)
            results.append(json.loads(out))
        return results
    finally:
        for p in ps:
            if p.poll() is None: p.kill(); p.wait()


def fresh(root,name):
    p=root/(name+'.db'); s.init(p); return p


def scenario():
    out={}
    with tempfile.TemporaryDirectory() as temp:
        root=Path(temp)
        p=fresh(root,'restart'); s.open_wait(p,'f','reply',0,10,0)
        a=child(p,'signal',['e','f','reply',1,'yes',3]); assert a.returncode==0
        b=child(p,'resume',['f','reply',1]); assert b.returncode==0
        assert len(s.snapshot(p)['effect'])==1
        out['restart_wait']={'signal':json.loads(a.stdout)['result'],'continuation':json.loads(b.stdout),'effects':1}

        p=fresh(root,'early'); a=s.signal(p,'e','f','reply',1,'yes',0); s.open_wait(p,'f','reply',0,10,0)
        b=s.signal(p,'e','f','reply',1,'yes',1); c=s.signal(p,'new','f','reply',1,'yes',1)
        assert (a['result'],b['original'],c['result'])==('unknown_wait','unknown_wait','accepted')
        out['early_signal']=[a,b,c]

        p=fresh(root,'duplicate'); s.open_wait(p,'f','reply',0,10,0); s.signal(p,'e','f','reply',1,'yes',1)
        out['receipt_identity']=[s.signal(p,'e','f','reply',1,'yes',99),s.signal(p,'e','f','reply',1,'no',1),s.signal(p,'e','f','reply',2,'yes',1)]
        assert out['receipt_identity']==[{'result':'replay','original':'accepted'},{'result':'conflict'},{'result':'conflict'}]

        p=fresh(root,'boundary'); s.open_wait(p,'f','reply',0,10,0)
        out['deadline_without_timer']=s.signal(p,'e','f','reply',1,'yes',10)
        assert out['deadline_without_timer']['result']=='too_late'; s.resume(p,'f','reply',1); assert s.check_invariants(p)

        p=fresh(root,'highwater'); s.open_wait(p,'f','reply',0,10,0); s.open_wait(p,'g','reply',0,30,12)
        out['clock_highwater']=s.signal(p,'e','f','reply',1,'yes',2)
        assert out['clock_highwater']['result']=='too_late'

        p=fresh(root,'generation'); s.open_wait(p,'f','reply',0,10,0); s.expire(p,'f','reply',1,10)
        blocked=s.open_wait(p,'f','reply',1,30,10); assert blocked['result']=='pending_continuation'
        s.resume(p,'f','reply',1); s.open_wait(p,'f','reply',1,30,11)
        late=s.signal(p,'old','f','reply',1,'yes',12); timer=s.expire(p,'f','reply',1,13)
        assert late['result']==timer=='stale_generation'; assert s.snapshot(p)['waiting'][1]['state']=='waiting'
        out['generation_isolation']={'before_resume':blocked['result'],'old_signal':late['result'],'old_timer':timer,'new_state':'waiting'}

        exits=[]
        for op,args,points in [
          ('open_wait',['f','reply',0,10,0],['after_wait_insert','before_commit','after_commit']),
          ('signal',['e','f','reply',1,'yes',1],['after_terminal_update','after_continuation_insert','after_receipt_insert','before_commit','after_commit']),
          ('expire',['f','reply',1,10],['after_terminal_update','after_continuation_insert','before_commit','after_commit']),
          ('resume',['f','reply',1],['after_effect_insert','before_commit','after_commit'])]:
            for point in points:
                p=fresh(root,op+point)
                if op!='open_wait': s.open_wait(p,'f','reply',0,10,0)
                if op=='resume': s.signal(p,'e','f','reply',1,'yes',1)
                proc=child(p,op,args,point); assert proc.returncode==73,(op,point,proc.stderr)
                before=s.snapshot(p); assert s.check_invariants(p)
                if op=='open_wait': assert len(before['waiting'])==(point=='after_commit')
                if op in ('signal','expire'): assert len(before['continuation'])==(point=='after_commit')
                if op=='resume': assert len(before['effect'])==(point=='after_commit')
                invoke(p,op,args); assert s.check_invariants(p)
                exits.append(op+':'+point)
        out['crash_boundaries']={'count':len(exits),'verified':exits,'exit_code':73}

        p=fresh(root,'signal_race'); s.open_wait(p,'f','reply',0,10,0)
        rs=race(p,[('signal',[f'e{i}','f','reply',1,'yes',1]) for i in range(8)])
        assert sum(r['result']=='accepted' for r in rs)==1; assert s.check_invariants(p)
        out['signal_contention']={'processes':8,'accepted':1,'closed':7}

        p=fresh(root,'deadline_race'); s.open_wait(p,'f','reply',0,10,0)
        rs=race(p,[('signal',[f'e{i}','f','reply',1,'yes',10]) if i%2 else ('expire',['f','reply',1,10]) for i in range(8)])
        snap=s.snapshot(p); assert snap['waiting'][0]['state']=='timed_out' and len(snap['continuation'])==1; assert s.check_invariants(p)
        out['deadline_contention']={'processes':8,'terminal':'timed_out','continuations':1}

        p=fresh(root,'resume_race'); s.open_wait(p,'f','reply',0,10,0); s.signal(p,'e','f','reply',1,'yes',1)
        rs=race(p,[('resume',['f','reply',1]) for _ in range(8)])
        assert rs.count('resumed')==1 and rs.count('replay')==7; assert s.check_invariants(p)
        out['resume_contention']={'processes':8,'resumed':1,'replays':7,'effects':len(s.snapshot(p)['effect'])}

        p=fresh(root,'open_race')
        rs=race(p,[('open_wait',['f','reply',0,10,0]) for _ in range(8)])
        assert sum(r['result']=='opened' for r in rs)==1 and len(s.snapshot(p)['waiting'])==1
        out['open_contention']={'processes':8,'opened':1,'stale':7}
        for db in root.glob('*.db'): assert s.check_invariants(db)
    return out


if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1] in ('--child','--gate'):
        mode,path,op,args=sys.argv[1:5]
        if mode=='--gate':
            print('READY',flush=True)
            assert sys.stdin.readline().strip()=='GO'
        result=invoke(path,op,json.loads(args),sys.argv[5] if mode=='--child' else None)
        print(json.dumps(result),flush=True)
    else:
        ap=argparse.ArgumentParser(); ap.add_argument('--check',action='store_true'); opts=ap.parse_args()
        result=scenario(); target=HERE/'results.json'
        if opts.check:
            assert result==json.loads(target.read_text())
            print(f'PASS: {len(result)} scenario groups match results.json')
        else:
            target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
            print(f'Wrote {len(result)} verified scenario groups')

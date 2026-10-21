"""Actual subprocess exits and gated late arrivals; deterministic semantic replay."""
import argparse
import json
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
from retention import init, execute, expire_results, close_and_collect, snapshot, connection, transaction
SCRIPT=Path(__file__).with_name('retention.py')

def child(path, action='execute', fault='none', epoch=1):
    p=subprocess.run([sys.executable,str(SCRIPT),str(path),action,'--fault',fault,'--epoch',str(epoch)],
                     capture_output=True,text=True,timeout=15)
    expected={'none':0,'before_receipt':71,'after_effect_commit':72,'after_boundary':73,
              'before_close_commit':74,'after_close_commit':75}[fault]
    assert p.returncode==expected,(p.returncode,p.stderr)
    return {'exit':p.returncode,'reply':json.loads(p.stdout) if p.stdout else None}

def late(path, mutation, op='work-1'):
    p=subprocess.Popen([sys.executable,str(SCRIPT),str(path),'execute','--gate','--op',op],
                       stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        with selectors.DefaultSelector() as sel:
            sel.register(p.stdout,selectors.EVENT_READ)
            assert sel.select(15),'gate timeout'
        assert p.stdout.readline().strip()=='READY'
        mutation()
        out,err=p.communicate('GO\n',timeout=15)
        assert p.returncode==0,err
        return json.loads(out)
    finally:
        if p.poll() is None:
            p.kill()
        p.wait(timeout=15)
        for f in (p.stdin,p.stdout,p.stderr):
            if not f.closed: f.close()

def unsafe_delete(path):
    # Deliberately wrong policy: receipt removal without a durable rejection boundary.
    with connection(path) as c, transaction(c):
        c.execute('DELETE FROM receipt')

def experiment():
    r={}
    with tempfile.TemporaryDirectory() as temp:
        def fresh(name):
            path=Path(temp)/f'{name}.db';init(path);return path
        p=fresh('naive');execute(p,1,'work-1')
        r['naive_delete']={'late':late(p,lambda:unsafe_delete(p)),'state':snapshot(p)}
        p=fresh('tombstone');execute(p,1,'work-1');expire_results(p,1)
        r['tombstone']={'retry':execute(p,1,'work-1'),'conflict':execute(p,1,'work-1','changed'), 'state':snapshot(p)}
        p=fresh('sealed');execute(p,1,'work-1')
        r['sealed_late']={'late':late(p,lambda:close_and_collect(p,1)),
                          'unseen':execute(p,1,'never-seen'),'new_epoch':execute(p,2,'new-work'), 'state':snapshot(p)}
        for fault in ['after_boundary','before_close_commit','after_close_commit']:
            p=fresh(fault);execute(p,1,'work-1')
            crash=child(p,'close',fault)
            before=snapshot(p)
            retry=execute(p,1,'work-1')
            r[fault]={'crash':crash,'before_retry':before,'retry':retry,'state':snapshot(p)}
        for fault in ['before_receipt','after_effect_commit']:
            p=fresh(fault)
            crash=child(p,fault=fault)
            before=snapshot(p)
            r[fault]={'crash':crash,'before_retry':before,'retry':execute(p,1,'work-1'),'state':snapshot(p)}
        p=fresh('new_epoch');execute(p,1,'work-1');close_and_collect(p,1)
        r['rekey_is_new_intent']={'retry':execute(p,2,'work-1'),'state':snapshot(p)}
        p=fresh('scopes');init(p,'other');execute(p,1,'work-1');execute(p,1,'work-1',namespace='other');close_and_collect(p,1)
        r['namespace_isolation']={'other':execute(p,1,'work-1',namespace='other'),'state':snapshot(p)}
    validate(r)
    return r

def validate(r):
    assert r['naive_delete']['state']['effects']==2
    assert r['tombstone']['retry']['status']=='result_expired'
    assert r['tombstone']['conflict']['status']=='conflict'
    assert r['tombstone']['state']['effects']==1
    assert r['sealed_late']['late']['status']==r['sealed_late']['unseen']['status']=='closed'
    assert r['sealed_late']['state']['effects']==2
    for name in ['after_boundary','before_close_commit']:
        assert r[name]['before_retry']['boundaries']==[['demo',0]]
        assert r[name]['before_retry']['receipts']==1
        assert r[name]['retry']['status']=='replayed'
    assert r['after_close_commit']['before_retry']['receipts']==0
    assert r['after_close_commit']['retry']['status']=='closed'
    assert r['before_receipt']['before_retry']['effects']==0
    assert r['after_effect_commit']['before_retry']['effects']==1
    assert r['after_effect_commit']['retry']['status']=='replayed'
    assert r['rekey_is_new_intent']['state']['effects']==2
    assert r['namespace_isolation']['other']['status']=='replayed'

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');p.add_argument('--output',type=Path);a=p.parse_args()
    actual=experiment()
    if a.check:
        assert actual==json.loads(Path(__file__).with_name('results.json').read_text()),'semantic results differ'
    encoded=json.dumps(actual,ensure_ascii=False,indent=2)+'\n'
    if a.output:a.output.write_text(encoded)
    print(encoded,end='')

import sqlite3,sys,time,json,os
from pathlib import Path
p=Path(os.environ.get('PLANET_STATS_DB',str(Path.home()/'.local/share/ai-knowledgepoints/planet.sqlite3')));p.parent.mkdir(parents=True,exist_ok=True)
db=sqlite3.connect(p,timeout=8)
db.execute('CREATE TABLE IF NOT EXISTS events (episode TEXT, action TEXT, visitor TEXT, bucket INTEGER, UNIQUE(episode,action,visitor,bucket))')
id,action,visitor=sys.argv[1:]
with db:
 if action!='read':
  bucket=int(time.time()//1800) if action=='view' else 0
  db.execute('INSERT OR IGNORE INTO events VALUES (?,?,?,?)',(id,action,visitor,bucket))
 counts=dict(db.execute('SELECT action,count(*) FROM events WHERE episode=? GROUP BY action',(id,)))
print(json.dumps(dict(views=counts.get('view',0),likes=counts.get('like',0),shares=counts.get('share',0))))

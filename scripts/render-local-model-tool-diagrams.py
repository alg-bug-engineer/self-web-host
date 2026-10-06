from pathlib import Path
from xml.sax.saxutils import escape
OUT=Path(__file__).resolve().parent.parent / 'public/images/articles/local-model-tool-commentary'
B='#2457a6';G='#526275'
def make(mobile):
 w,h=(540,1680) if mobile else (1080,960)
 s=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-labelledby="title desc">','<title id="title">本地模型与工具的数据边界</title><desc id="desc">假想架构，非 Beam 默认配置。模型提出请求，执行层检查目标、数据和授权，再选择内部工具、获准外部服务或拒绝。</desc>','<defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9" fill="none" stroke="#7891ac" stroke-width="1.4"/></marker></defs>',f'<rect width="{w}" height="{h}" fill="white"/>']
 def text(x,y,t,size=27,color=G,weight='400'):
  s.append(f'<text x="{x}" y="{y}" font-family="Noto Sans CJK SC,Microsoft YaHei,sans-serif" font-size="{size}" fill="{color}" font-weight="{weight}">{escape(t)}</text>')
 def rect(x,y,cw,ch,fill):s.append(f'<rect x="{x}" y="{y}" width="{cw}" height="{ch}" rx="20" fill="{fill}" stroke="#b8c9db" stroke-width="1.5"/>')
 def card(x,y,cw,ch,t,lines,fill='#eef5ff'):
  rect(x,y,cw,ch,fill);text(x+22,y+45,t,30,B,'600')
  for i,line in enumerate(lines):text(x+22,y+93+i*41,line)
 def arrow(d):s.append(f'<path d="{d}" fill="none" stroke="#7891ac" stroke-width="1.8" marker-end="url(#arrow)"/>')
 if mobile:
  text(35,58,'模型在内部，工具去哪里？',32,B,'700')
  text(35,104,'假想架构 · 非 Beam 默认配置')
  card(35,151,470,210,'内部材料 → 本地推理',['模型可以提出工具请求','工具与网络权限由部署决定','权重不会凭空获得外联能力'])
  arrow('M270 361 L270 405')
  card(35,420,470,210,'执行层：执行前检查',['请求发给谁？会带出什么？','是否拥有相应授权？','模型不能替系统签发权限'],'#eaf5f4')
  arrow('M270 630 L270 672')
  text(35,718,'按具体请求选择下列路径',28,B,'600')
  card(35,755,470,171,'内部工具',['内部 OCR / 检索','核对处理位置与实际依赖'],'#eaf5f4')
  card(35,955,470,171,'获准的外部服务',['接收方、材料与用途获准','此路径会向外发送数据'])
  card(35,1155,470,171,'未知或未获准的请求',['拒绝执行，并说明原因','不自动改走其他网络出口'],'#fff0ef')
  rect(35,1370,470,190,'#fff5cf')
  text(55,1417,'模型放在哪，资料送给谁',29,B,'600')
  text(55,1458,'需要分开验收',29,B,'600')
  text(55,1504,'“只读”也可能向外发送数据')
  text(55,1543,'其他网络路径同样需要控制')
  text(35,1616,'AI 辅助原创示意 · 非实测结果')
  text(35,1657,'不构成完整安全保证')
 else:
  text(40,62,'模型在内部，工具去哪里？',40,B,'700')
  text(40,110,'假想架构 · 非 Beam 实现图或默认配置')
  card(40,166,440,216,'内部材料 → 本地推理',['模型可以提出工具请求','工具与联网能力由部署决定','权重不会凭空获得外联权限'])
  arrow('M480 274 L550 274')
  card(570,166,470,216,'执行层：执行前检查',['请求发给谁？会带出什么？','是否拥有相应授权？','模型不能替系统签发权限'],'#eaf5f4')
  arrow('M800 382 L800 422 L200 422 L200 473')
  arrow('M800 422 L540 422 L540 473')
  arrow('M800 422 L880 422 L880 473')
  card(40,490,320,211,'内部工具',['内部 OCR / 检索','核对处理位置','及工具实际依赖'],'#eaf5f4')
  card(380,490,320,211,'获准的外部服务',['接收方、材料与用途','在许可范围内','此路径会外发数据'])
  card(720,490,320,211,'未获准的请求',['未知或不允许的去向','拒绝执行并说明原因','不自动改走其他出口'],'#fff0ef')
  rect(40,753,1000,130,'#fff5cf')
  text(64,802,'模型放在哪里，与资料送给谁，分开验收',32,B,'600')
  text(64,849,'“只读”也可能外发 · 其他网络路径同样需要控制')
  text(40,933,'AI 辅助原创架构示意 · 非实测结果 · 不构成完整安全保证')
 s.append('</svg>');return '\n'.join(s)
for name,mobile in [('tool-boundary',False),('tool-boundary-mobile',True)]:
 (OUT/(name+'.svg')).write_text(make(mobile),encoding='utf-8')

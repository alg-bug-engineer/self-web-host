import {expect,test} from '@playwright/test'
import {XMLParser} from 'fast-xml-parser'
import fs from 'node:fs/promises'
const origin='https://ai-knowledgepoints.cn'
const entries=[{slug:'agent-reliability-01-outbox-idempotency',title:'Agent 可靠执行实战（一）：工具干完了，回执丢了怎么办？',dir:'agent-reliability-01',diagrams:['transaction-boundary','recovery-choice'],bounds:['没有调用大模型','16 个具名场景','unknown','Python 标准库'],commentary:false},{slug:'commentary-2026-10-06-local-model-tool-boundary',title:'模型搬进内网，工具还在打外线？',dir:'local-model-tool-commentary',diagrams:['tool-boundary'],bounds:['假想场景','本文没有独立复现','纯文本模型'],commentary:true}]
for(const item of entries){const route='/blog/'+item.slug
 test(item.slug+' 正文、目录、导航与CTA',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(route)
  await expect(page.locator('h1')).toHaveText(item.title);const content=page.locator('[data-article-content]');for(const text of item.bounds)await expect(content).toContainText(text)
  await expect(content).not.toContainText('EXPERIMENT_RESULTS');await expect(content).not.toContainText('**');await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',origin+route)
  await expect(page.getByTestId('planet-gate-inline')).toHaveCount(0);await expect(page.getByRole('link',{name:'查看学习社区'})).toHaveAttribute('href','https://t.zsxq.com/WtjvX')
  if(!item.commentary){
   const guide=page.getByRole('navigation',{name:'本文目录'}),links=guide.locator('a[href^="#"]')
   await expect(links).toHaveCount(await content.locator('h2').count())
   const href=await links.last().getAttribute('href'),id=href!.slice(1)
   await links.last().click();await expect.poll(()=>decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(id)
   await expect.poll(()=>page.evaluate(id=>{const y=document.getElementById(id)?.getBoundingClientRect().top;return typeof y==='number'&&y>=0&&y<innerHeight},id)).toBe(true)
   await expect(content.locator('table')).toHaveCount(2)
  } else await expect(page.getByRole('navigation',{name:'本文目录'})).toHaveCount(0)
  if(item.commentary){await page.getByRole('link',{name:'返回 AI锐评',exact:true}).click();await expect(page).toHaveURL(/\/commentary$/);await page.goBack();await expect(page.locator('h1')).toHaveText(item.title)}
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([])
 })
 test(item.slug+' 独立桌面/手机SVG可读并可打开',async({page},info)=>{
  await page.goto(route);const mobile=info.project.name==='mobile-chromium',figures=page.getByTestId('article-diagram');await expect(figures).toHaveCount(item.diagrams.length)
  for(const [i,name]of item.diagrams.entries()){const figure=figures.nth(i),img=figure.locator('img');await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);expect(await img.evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBe(mobile?540:1080);const filename=name+(mobile?'-mobile':'')+'.svg';expect(await img.evaluate((e:HTMLImageElement)=>e.currentSrc)).toContain(filename);expect(27*await img.evaluate(e=>e.getBoundingClientRect().width)/(mobile?540:1080)).toBeGreaterThanOrEqual(14);const popupPromise=page.waitForEvent('popup');await figure.locator('a:visible').click();const popup=await popupPromise;await popup.waitForLoadState();await expect(popup).toHaveURL(new RegExp(filename+'$'));await popup.close()}
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 })
 test(item.slug+' Markdown、feeds、sitemap与附件精确字节',async({page})=>{
  const md=await page.request.get(route+'/index.html.md');expect(md.ok()).toBe(true);expect(md.headers().link).toContain(`<${origin}${route}>; rel="canonical"`);const text=await md.text();expect(text).not.toContain('<ArticleDiagram');for(const s of item.bounds)expect(text).toContain(s)
  for(const name of item.diagrams)for(const suffix of ['','-mobile']){const path=`/images/articles/${item.dir}/${name}${suffix}.svg`;expect(text).toContain(path);const response=await page.request.get(path);expect(response.ok()).toBe(true);expect(response.headers()['content-type']).toContain('image/svg+xml');expect(await response.body()).toEqual(await fs.readFile('public'+path))}
  if(!item.commentary)for(const name of ['reliability.py','run_experiment.py','test_reliability.py','results.json','README.md']){const path='/examples/agent-reliability-01/'+name;expect(text).toContain(path);const response=await page.request.get(path);expect(response.ok()).toBe(true);expect(await response.body()).toEqual(await fs.readFile('public'+path))}
  const parser=new XMLParser();for(const [feed,n]of [['/feed.xml',1],['/commentary/feed.xml',item.commentary?1:0]] as const){const data=parser.parse(await(await page.request.get(feed)).text()).rss.channel.item;expect(data.filter((x:{link:string})=>x.link===origin+route)).toHaveLength(n)}for(const path of ['/sitemap.xml','/llms.txt'])expect(await(await page.request.get(path)).text()).toContain(origin+route)
 })
}

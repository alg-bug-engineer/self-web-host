import {expect,test} from '@playwright/test'
import {XMLParser} from 'fast-xml-parser'
import fs from 'node:fs/promises'
const origin='https://ai-knowledgepoints.cn'
const entries=[{slug:'rag-evaluation-03-rrf-candidate-reranking',title:'RAG 评测实战（三）：两路词法检索，怎样测 RRF 与重排？',dir:'rag-evaluation-03',diagrams:['rank-fusion','three-budgets'],bounds:['两路词法检索','不是生产 RAG','不实现 ACL','gold-blind'],commentary:false},{slug:'commentary-2026-10-03-model-harness-fit',title:'模型排行榜，别把鞋藏起来',dir:'harness-fit-commentary',diagrams:['ranking-reversal'],bounds:['36 道','38 道','每题只计一次运行','本文没有独立复现'],commentary:true}]
for(const item of entries){const route='/blog/'+item.slug
 test(item.slug+' 正文、目录、导航与CTA',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(route)
  await expect(page.locator('h1')).toHaveText(item.title);const content=page.locator('[data-article-content]');for(const text of item.bounds)await expect(content).toContainText(text)
  await expect(content).not.toContainText('EXPERIMENT_RESULTS');await expect(content).not.toContainText('**');await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',origin+route)
  await expect(page.getByTestId('planet-gate-inline')).toHaveCount(0);await expect(page.getByRole('link',{name:'查看学习社区'})).toHaveAttribute('href','https://t.zsxq.com/WtjvX')
  if(!item.commentary){await content.getByRole('link',{name:'第二篇：切块、稳定证据映射与预算对照',exact:true}).click();await expect(page).toHaveURL(/rag-evaluation-02-chunking-evidence-mapping$/);await page.locator('[data-article-content]').getByRole('link',{name:'第三篇：两路词法、RRF 与重排机制实验',exact:true}).click();await expect(page.locator('h1')).toHaveText(item.title)}else{await page.getByRole('link',{name:'返回 AI锐评',exact:true}).click();await expect(page).toHaveURL(/\/commentary$/);await page.goBack();await expect(page.locator('h1')).toHaveText(item.title)}
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
  if(!item.commentary)for(const name of ['evaluate.mjs','fixture.json','test.mjs','results.json','README.md']){const path='/examples/rag-evaluation-03/'+name;expect(text).toContain(path);const response=await page.request.get(path);expect(response.ok()).toBe(true);expect(await response.body()).toEqual(await fs.readFile('public'+path))}
  const parser=new XMLParser();for(const [feed,n]of [['/feed.xml',1],['/commentary/feed.xml',item.commentary?1:0]] as const){const data=parser.parse(await(await page.request.get(feed)).text()).rss.channel.item;expect(data.filter((x:{link:string})=>x.link===origin+route)).toHaveLength(n)}for(const path of ['/sitemap.xml','/llms.txt'])expect(await(await page.request.get(path)).text()).toContain(origin+route)
 })
}

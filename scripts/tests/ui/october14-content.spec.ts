import {expect,test} from '@playwright/test'
import {XMLParser} from 'fast-xml-parser'
import fs from 'node:fs/promises'
const origin='https://ai-knowledgepoints.cn'
const slugs=['commentary-2026-10-14-scion-code-transport','agent-reliability-06-idempotency-retention']
for(const slug of slugs){
 const route='/blog/'+slug
 test(slug+' 正文、规范链接与导航',async({page})=>{
  const raw=await fs.readFile('content/posts/'+slug+'.mdx','utf8'),title=raw.match(/^title: "(.*)"$/m)![1]
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(route)
  await expect(page.locator('h1')).toHaveText(title)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',origin+route)
  const content=page.locator('[data-article-content]');await expect(content).toContainText('AI 辅助制作')
  await expect(content).not.toContainText('EXPERIMENT_RESULTS');await expect(content).not.toContainText('**')
  await expect(page.getByTestId('planet-gate-inline')).toHaveCount(0)
  await expect(page.getByRole('link',{name:'查看学习社区'})).toHaveAttribute('href','https://t.zsxq.com/WtjvX')
  if(raw.includes('postType: commentary')){await expect(page.getByRole('navigation',{name:'本文目录'})).toHaveCount(0);await page.getByRole('link',{name:'返回 AI锐评',exact:true}).click();await expect(page).toHaveURL(/\/commentary$/);await page.goBack();await expect(page.locator('h1')).toHaveText(title)}
  else {const links=page.getByRole('navigation',{name:'本文目录'}).locator('a[href^="#"]');await expect(links).toHaveCount(await content.locator('h2').count());const href=await links.last().getAttribute('href');await links.last().click();await expect.poll(()=>decodeURIComponent(new URL(page.url()).hash)).toBe(href)}
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([])
 })
 test(slug+' 图解手机桌面可读及原图',async({page},info)=>{
  const raw=await fs.readFile('content/posts/'+slug+'.mdx','utf8'),mobile=info.project.name==='mobile-chromium'
  const paths=[...raw.matchAll(mobile?/mobileSrc="([^\"]+)"/g:/<ArticleDiagram src="([^\"]+)"/g)].map(m=>m[1])
  await page.goto(route);const figures=page.getByTestId('article-diagram');await expect(figures).toHaveCount(paths.length)
  for(const [i,path]of paths.entries()){
   const svg=await fs.readFile('public'+path,'utf8'),width=Number(svg.match(/<svg[^>]*\bwidth="(\d+)"/)![1]),font=Math.min(...[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>Number(m[1])))
   const figure=figures.nth(i),img=figure.locator('img');await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true)
   expect(await img.evaluate((e:HTMLImageElement)=>e.naturalWidth)).toBe(width);expect(await img.evaluate((e:HTMLImageElement)=>e.currentSrc)).toContain(path)
   expect(font*await img.evaluate(e=>e.getBoundingClientRect().width)/width).toBeGreaterThanOrEqual(14)
   const popupPromise=page.waitForEvent('popup');await figure.locator('a:visible').click();const popup=await popupPromise;await popup.waitForLoadState();expect(new URL(popup.url()).pathname).toBe(path);await popup.close()
  }
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 })
 test(slug+' 320与断点附近图解可读',async({page})=>{
  const raw=await fs.readFile('content/posts/'+slug+'.mdx','utf8')
  for(const viewport of [320,768,1024]){
   await page.setViewportSize({width:viewport,height:900});await page.goto(route)
   const paths=[...raw.matchAll(viewport<768?/mobileSrc="([^\"]+)"/g:/<ArticleDiagram src="([^\"]+)"/g)].map(m=>m[1])
   for(const [i,path]of paths.entries()){
    const svg=await fs.readFile('public'+path,'utf8'),width=Number(svg.match(/<svg[^>]*\bwidth="(\d+)"/)![1]),font=Math.min(...[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>Number(m[1])))
    const img=page.getByTestId('article-diagram').nth(i).locator('img');await img.scrollIntoViewIfNeeded();await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true)
    expect(font*await img.evaluate(e=>e.getBoundingClientRect().width)/width).toBeGreaterThanOrEqual(14)
   }
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  }
 })
 test(slug+' Markdown、订阅与下载字节',async({page})=>{
  const raw=await fs.readFile('content/posts/'+slug+'.mdx','utf8'),commentary=raw.includes('postType: commentary')
  const md=await page.request.get(route+'/index.html.md');expect(md.ok()).toBe(true);expect(md.headers().link).toContain(`<${origin}${route}>; rel="canonical"`)
  const text=await md.text();expect(text).not.toContain('<ArticleDiagram');expect(text).toContain('AI 辅助制作')
  const paths=[...new Set([...raw.matchAll(/(?:src|mobileSrc)="(\/images\/[^\"]+)"|\]\((\/examples\/[^)]+)\)/g)].map(m=>m[1]||m[2]))]
  for(const path of paths){expect(text).toContain(path);const response=await page.request.get(path);expect(response.ok()).toBe(true);expect(await response.body()).toEqual(await fs.readFile('public'+path))}
  const parser=new XMLParser();for(const [feed,n]of [['/feed.xml',1],['/commentary/feed.xml',commentary?1:0]] as const){const data=parser.parse(await(await page.request.get(feed)).text()).rss.channel.item;expect(data.filter((x:{link:string})=>x.link===origin+route)).toHaveLength(n)}
  for(const path of ['/sitemap.xml','/llms.txt'])expect(await(await page.request.get(path)).text()).toContain(origin+route)
 })
}

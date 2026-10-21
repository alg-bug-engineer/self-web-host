import { expect, test } from '@playwright/test'
import { XMLParser } from 'fast-xml-parser'
const path = '/blog/rag-evaluation-02-chunking-evidence-mapping'
const previous = '/blog/rag-evaluation-01-evidence-to-answer'
const title = 'RAG 评测实战（二）：切块一改，召回率为什么就失真了？'
const origin = 'https://ai-knowledgepoints.cn'
test('RAG第二篇正文、系列导航、CTA和浏览器返回', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(previous)
  await page.locator('[data-article-content]').getByRole('link', { name: /第二篇：切块一改/ }).click()
  await expect(page.locator('h1')).toHaveText(title)
  const content = page.locator('[data-article-content]')
  for (const text of ['合成教学 fixture', '不是生产 RAG', '不能称作 BM25', '不计算拒答率', '240 字符', '重复了 60 个']) await expect(content).toContainText(text)
  await expect(content).not.toContainText('EXPERIMENT_RESULTS')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href',origin+path)
  await expect(page.getByTestId('planet-gate-inline')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '查看学习社区' })).toHaveAttribute('href','https://t.zsxq.com/WtjvX')
  await content.getByRole('link', { name: '第一篇：检索命中了，为什么答案还是错的？' }).click()
  await expect(page).toHaveURL(new RegExp(previous+'$'))
  await page.goBack()
  await expect(page.locator('h1')).toHaveText(title)
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
test('RAG第二篇两张原创图在手机与桌面独立布局且可打开', async ({ page }, testInfo) => {
  await page.goto(path)
  const mobile=testInfo.project.name==='mobile-chromium'
  const figures=page.getByTestId('article-diagram')
  await expect(figures).toHaveCount(2)
  for (const [index,name] of ['evidence-mapping','context-budget'].entries()) {
    const figure=figures.nth(index), img=figure.locator('img')
    await img.scrollIntoViewIfNeeded()
    await expect.poll(()=>img.evaluate((e: HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true)
    expect(await img.evaluate((e: HTMLImageElement)=>e.naturalWidth)).toBe(mobile?540:1080)
    const filename=`${name}${mobile?'-mobile':''}.svg`
    expect(await img.evaluate((e: HTMLImageElement)=>e.currentSrc)).toContain(filename)
    const width=await img.evaluate(e=>e.getBoundingClientRect().width)
    expect(27*width/(mobile?540:1080)).toBeGreaterThanOrEqual(14)
    const popupPromise=page.waitForEvent('popup')
    await figure.locator('a:visible').click()
    const popup=await popupPromise
    await popup.waitForLoadState()
    await expect(popup).toHaveURL(new RegExp(filename+'$'))
    await popup.close()
  }
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
test('RAG第二篇下载、Markdown、feed和sitemap准确且不混入锐评', async ({ page }) => {
  const md=await page.request.get(path+'/index.html.md')
  expect(md.ok()).toBe(true)
  expect(md.headers().link).toContain(`<${origin}${path}>; rel="canonical"`)
  const text=await md.text()
  expect(text).toContain('完整结果会保留')
  expect(text).not.toContain('<ArticleDiagram')
  for(const name of ['evaluate.mjs','fixture.json','test.mjs','results.json','README.md']) {
    const url='/examples/rag-evaluation-02/'+name
    expect(text).toContain(url)
    const response=await page.request.get(url)
    expect(response.ok()).toBe(true)
    expect((await response.body()).length).toBeGreaterThan(100)
  }
  for(const base of ['evidence-mapping','context-budget']) for(const suffix of ['','-mobile']) {
    const url=`/images/articles/rag-evaluation-02/${base}${suffix}.svg`
    expect(text).toContain(url)
    const response=await page.request.get(url)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/svg+xml')
  }
  const parser=new XMLParser()
  for(const [feed,count] of [['/feed.xml',1],['/commentary/feed.xml',0]] as const) {
    const items=parser.parse(await (await page.request.get(feed)).text()).rss.channel.item
    expect(items.filter((item: {link:string})=>item.link===origin+path)).toHaveLength(count)
  }
  for(const url of ['/sitemap.xml','/llms.txt']) expect(await (await page.request.get(url)).text()).toContain(origin+path)
})

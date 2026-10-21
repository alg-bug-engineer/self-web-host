import { expect, test } from '@playwright/test'
import { XMLParser } from 'fast-xml-parser'

const articlePath = '/blog/calabash-agents-orchestration'
const articleTitle = '葫芦娃：七个顶配专家，一套散装调度'
const origin = 'https://ai-knowledgepoints.cn'

test('葫芦娃锐评正文、技术边界与原有转化入口保持完整', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/commentary')
  await page.getByRole('heading', { name: articleTitle, exact: true }).getByRole('link').click()
  await expect(page.locator('h1')).toHaveText(articleTitle)
  const content = page.locator('[data-article-content]')
  for (const text of ['七个人都很忙，爷爷还在洞里', '不是同一层面的机制', '也不天然糟糕', '这是一份假想作战方案，不是动画剧情复述', '合体成小金刚的故事在续作里', '二娃看到的，大娃出门前知道了吗？']) await expect(content).toContainText(text)
  await expect(page.getByTestId('planet-gate-inline')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '查看学习社区' })).toHaveAttribute('href', 'https://t.zsxq.com/WtjvX')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${articlePath}`)
  await page.getByRole('link', { name: '返回 AI锐评', exact: true }).click()
  await expect(page).toHaveURL(/\/commentary$/)
  await page.goBack()
  await expect(page.locator('h1')).toHaveText(articleTitle)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('葫芦娃图解在桌面和手机使用独立可读布局，机器入口一致', async ({ page }, testInfo) => {
  await page.goto(articlePath)
  const figures = page.getByTestId('article-diagram')
  await expect(figures).toHaveCount(2)
  const mobile = testInfo.project.name === 'mobile-chromium'
  for (const [index, name, height, mobileHeight] of [[0, 'capabilities-and-coordination', 782, 1190], [1, 'isolated-vs-coordinated', 864, 1470]] as const) {
    const figure = figures.nth(index)
    const img = figure.locator('img')
    await img.scrollIntoViewIfNeeded()
    await expect.poll(() => img.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
    expect(await img.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(mobile ? 540 : 1080)
    expect(await img.evaluate((element: HTMLImageElement) => element.naturalHeight)).toBe(mobile ? mobileHeight : height)
    const filename = `${name}${mobile ? '-mobile' : ''}.svg`
    expect(await img.evaluate((element: HTMLImageElement) => element.currentSrc)).toContain(filename)
    const width = await img.evaluate((element) => element.getBoundingClientRect().width)
    expect(24 * width / (mobile ? 540 : 1080)).toBeGreaterThanOrEqual(14)
    await expect(figure.locator('a:visible')).toHaveAttribute('href', `/images/articles/calabash-agents-commentary/${filename}`)
    const asset = await page.request.get(`/images/articles/calabash-agents-commentary/${filename}`)
    expect(asset.ok()).toBe(true)
    expect(asset.headers()['content-type']).toContain('image/svg+xml')
  }
  const markdown = await page.request.get(`${articlePath}/index.html.md`)
  expect(markdown.ok()).toBe(true)
  expect(markdown.headers().link).toContain(`<${origin}${articlePath}>; rel="canonical"`)
  const text = await markdown.text()
  expect(text).toContain('栏目：[AI锐评]')
  expect(text).toContain('![能力与协作清单')
  expect(text).toContain('isolated-vs-coordinated-mobile.svg')
  expect(text).not.toContain('<ArticleDiagram')
  const parser = new XMLParser()
  for (const feed of ['/feed.xml', '/commentary/feed.xml']) {
    const xml = await (await page.request.get(feed)).text()
    const items = parser.parse(xml).rss.channel.item
    expect(items.filter((item: { link: string }) => item.link === `${origin}${articlePath}`)).toHaveLength(1)
  }
  for (const path of ['/sitemap.xml', '/llms.txt']) expect(await (await page.request.get(path)).text()).toContain(`${origin}${articlePath}`)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

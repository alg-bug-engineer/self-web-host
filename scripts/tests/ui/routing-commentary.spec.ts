import { expect, test } from '@playwright/test'
import { XMLParser } from 'fast-xml-parser'

const articlePath = '/blog/commentary-2026-10-01-model-routing-moving-cost'
const articleTitle = '别让 AI 为了省房租，天天搬家'
const origin = 'https://ai-knowledgepoints.cn'

test('模型路由锐评正文、来源边界和阅读导航完整', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/commentary')
  await page.getByRole('heading', { name: articleTitle, exact: true }).getByRole('link').click()
  await expect(page.locator('h1')).toHaveText(articleTitle)
  const content = page.locator('[data-article-content]')
  for (const text of ['搬家师傅倒是挺支持这个产品', '它用合成任务和公开会话中的行为做仿真', '把模型焊死，也算不上节约', '不将核对日期视为功能首发日期', '房租可以便宜，搬家师傅也不能天天来']) await expect(content).toContainText(text)
  await expect(content).not.toContainText('**')
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

test('模型路由原创图解在桌面与手机选择独立可读布局', async ({ page }, testInfo) => {
  await page.goto(articlePath)
  const figure = page.getByTestId('article-diagram')
  await expect(figure).toHaveCount(1)
  const mobile = testInfo.project.name === 'mobile-chromium'
  const img = figure.locator('img')
  await img.scrollIntoViewIfNeeded()
  await expect.poll(() => img.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
  expect(await img.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(mobile ? 540 : 1080)
  expect(await img.evaluate((element: HTMLImageElement) => element.naturalHeight)).toBe(mobile ? 1640 : 936)
  const filename = `routing-cache-cost${mobile ? '-mobile' : ''}.svg`
  expect(await img.evaluate((element: HTMLImageElement) => element.currentSrc)).toContain(filename)
  const width = await img.evaluate((element) => element.getBoundingClientRect().width)
  expect(25 * width / (mobile ? 540 : 1080)).toBeGreaterThanOrEqual(14)
  await expect(figure.locator('figcaption')).toContainText('不表示每次切换都会增加总成本')
  await expect(figure.locator('a:visible')).toHaveAttribute('href', `/images/articles/routing-cache-commentary/${filename}`)
  const popupPromise = page.waitForEvent('popup')
  await figure.locator('a:visible').click()
  const popup = await popupPromise
  await popup.waitForLoadState()
  await expect(popup).toHaveURL(new RegExp(`${filename}$`))
  await popup.close()
  await expect(page).toHaveURL(new RegExp(`${articlePath}$`))
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('模型路由锐评两个 RSS、机器入口和原创 SVG 一致', async ({ page }) => {
  const markdown = await page.request.get(`${articlePath}/index.html.md`)
  expect(markdown.ok()).toBe(true)
  expect(markdown.headers().link).toContain(`<${origin}${articlePath}>; rel="canonical"`)
  const text = await markdown.text()
  expect(text).toContain('栏目：[AI锐评]')
  expect(text).toContain('![模型路由的缓存成本')
  expect(text).not.toContain('<ArticleDiagram')
  for (const suffix of ['', '-mobile']) {
    const filename = `routing-cache-cost${suffix}.svg`
    expect(text).toContain(filename)
    const response = await page.request.get(`/images/articles/routing-cache-commentary/${filename}`)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('image/svg+xml')
    const svg = await response.text()
    expect(svg).toContain('若无可用缓存')
    expect(svg).toContain('省下的费用能否覆盖重建')
  }
  const parser = new XMLParser()
  for (const feed of ['/feed.xml', '/commentary/feed.xml']) {
    const xml = await (await page.request.get(feed)).text()
    const items = parser.parse(xml).rss.channel.item
    expect(items.filter((item: { link: string }) => item.link === `${origin}${articlePath}`)).toHaveLength(1)
  }
  for (const path of ['/sitemap.xml', '/llms.txt']) expect(await (await page.request.get(path)).text()).toContain(`${origin}${articlePath}`)
})

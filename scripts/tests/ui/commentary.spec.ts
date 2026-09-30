import { expect, test } from '@playwright/test'
import { XMLParser } from 'fast-xml-parser'

const articlePath = '/blog/commentary-2026-09-30-sonnet-max-review'
const articleTitle = 'AI 改完了，为什么你更不敢点「合并」了？'
const origin = 'https://ai-knowledgepoints.cn'

test('AI锐评有独立首页和导航入口，阅读返回与历史导航可重复使用', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const block = page.locator('.home-commentary')
  await expect(block.getByRole('heading', { name: 'AI锐评', exact: true })).toBeVisible()
  await expect(block.locator('a[href^="/blog/"]')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: '技术长文' })).toBeVisible()
  if (testInfo.project.name === 'mobile-chromium') {
    await page.setViewportSize({ width: 375, height: 667 })
    const trigger = page.getByRole('button', { name: '打开菜单' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: '网站导航' })
    const about = dialog.getByRole('link', { name: /关于我/ })
    await about.scrollIntoViewIfNeeded()
    await expect(about).toBeInViewport()
    await expect(dialog.getByRole('link', { name: '搜索网站内容' })).toBeInViewport()
    await dialog.getByRole('link', { name: /AI锐评/ }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('link', { name: /AI锐评/ })).toBeInViewport()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await trigger.click()
    await dialog.getByRole('link', { name: /AI锐评/ }).click()
    await expect(dialog).toBeHidden()
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
  } else {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('link', { name: 'AI锐评', exact: true }).click()
  }
  await expect(page).toHaveURL(/\/commentary$/)
  await expect(page.locator('h1')).toHaveText('AI锐评热闹看完，聊点真话。')
  const knownArticle = page.getByRole('heading', { name: articleTitle, exact: true })
  await expect(knownArticle).toBeVisible()
  await knownArticle.getByRole('link').click()
  await expect(page.locator('h1')).toHaveText(articleTitle)
  await expect(page.locator('[data-article-content]')).toContainText('代码是写快了，人却一点也没轻松。')
  await expect(page.locator('[data-article-content]')).toContainText('不是作者实测报告')
  await expect(page.locator('[data-article-content]')).not.toContainText('**')
  await expect(page.getByTestId('planet-gate-inline')).toHaveCount(0)
  await page.getByRole('link', { name: '返回 AI锐评', exact: true }).click()
  await expect(page).toHaveURL(/\/commentary$/)
  await page.goBack()
  await expect(page.locator('h1')).toHaveText(articleTitle)
  await page.goForward()
  await expect(page.locator('h1')).toHaveText(/AI锐评/)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('锐评筛选不污染技术分类，重复切换与搜索和标签仍然生效', async ({ page }) => {
  await page.goto('/blog')
  const commentary = page.getByRole('button', { name: /^AI锐评/ })
  const principles = page.getByRole('button', { name: /^模型与原理/ })
  const all = page.getByRole('button', { name: /^全部文章/ })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await commentary.click()
    await expect(commentary).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator(`a[href="${articlePath}"]`)).toHaveCount(1)
    await expect(page.getByTestId('article-card-date').first()).toHaveText(/\d{4}\/\d{1,2}\/\d{1,2} 发布/)
    await expect(page.locator('a[href="/blog/rag-evaluation-01-evidence-to-answer"]')).toHaveCount(0)
    await page.getByLabel('搜索文章或标签').fill('不可能存在的检索内容')
    await expect(page.getByText('没有找到相关文章，换个关键词试试。')).toBeVisible()
    await page.getByLabel('搜索文章或标签').fill('Sonnet')
    await expect(page.locator(`a[href="${articlePath}"]`)).toHaveCount(1)
    await page.getByLabel('搜索文章或标签').fill('')
    await principles.click()
    await expect(page.locator(`a[href="${articlePath}"]`)).toHaveCount(0)
    await expect(page.locator('a[href="/blog/rag-evaluation-01-evidence-to-answer"]')).toHaveCount(1)
    await all.click()
    await expect(page.locator(`a[href="${articlePath}"]`)).toHaveCount(1)
  }
  await page.goto(`${articlePath}`)
  await page.locator('article header a[href="/blog?tag=AI%E9%94%90%E8%AF%84"]').click()
  await expect(page.getByText('正在筛选标签:')).toBeVisible()
  await expect(page.locator(`a[href="${articlePath}"]`)).toHaveCount(1)
  await page.goBack()
  await expect(page.locator('h1')).toHaveText(articleTitle)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('锐评 canonical、结构化数据、两个订阅源与机器入口一致，不泄漏草稿', async ({ page }) => {
  await page.goto('/commentary')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/commentary`)
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href', `${origin}/commentary/feed.xml`)
  const collection = await page.locator('script[type="application/ld+json"]').evaluateAll((elements) => elements
    .flatMap((element) => JSON.parse(element.textContent || '{}')['@graph'] || [])
    .find((node) => node['@type'] === 'ItemList'))
  expect(collection.itemListElement.some((item: { url: string }) => item.url === `${origin}${articlePath}`)).toBe(true)
  expect(collection.numberOfItems).toBe(collection.itemListElement.length)

  const parser = new XMLParser()
  for (const feedPath of ['/feed.xml', '/commentary/feed.xml']) {
    const response = await page.request.get(feedPath)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain('application/rss+xml')
    const channel = parser.parse(await response.text()).rss.channel
    const items = Array.isArray(channel.item) ? channel.item : [channel.item]
    expect(items.filter((item: { link: string }) => item.link === `${origin}${articlePath}`)).toHaveLength(1)
    expect(items.every((item: { link: string }) => item.link.startsWith(`${origin}/blog/`))).toBe(true)
    if (feedPath.startsWith('/commentary')) {
      expect(channel.title).toContain('AI锐评')
      expect(items.some((item: { link: string }) => item.link.includes('rag-evaluation'))).toBe(false)
    }
  }
  for (const path of ['/sitemap.xml', '/llms.txt']) {
    const response = await page.request.get(path)
    const text = await response.text()
    expect(response.ok()).toBe(true)
    expect(text).toContain(`${origin}/commentary`)
    expect(text).toContain(`${origin}${articlePath}`)
    expect(text).not.toContain('/blog/daily-2026-08-11-ai-native-generation-learning-ability')
  }
  await page.goto(articlePath)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${articlePath}`)
  const article = await page.locator('script[type="application/ld+json"]').evaluateAll((elements) => elements
    .flatMap((element) => JSON.parse(element.textContent || '{}')['@graph'] || [])
    .find((node) => node.genre === '观点与分析'))
  expect(article['@type']).toBe('Article')
  expect(article.articleSection).toBe('AI锐评')
  expect(article.isPartOf['@id']).toBe(`${origin}/commentary#collection`)
  const markdown = await page.request.get(`${articlePath}/index.html.md`)
  expect(markdown.ok()).toBe(true)
  expect(markdown.headers().link).toContain(`<${origin}${articlePath}>; rel="canonical"`)
  expect(await markdown.text()).toContain('栏目：[AI锐评]')
  for (const slug of ['daily-2026-08-11-ai-native-generation-learning-ability', 'daily-2026-08-12-child-ai-three-questions', 'daily-2026-08-19-child-ai-define-the-problem', 'daily-2026-08-29-child-ai-project-evidence-board', 'daily-2026-09-03-child-ai-family-safety-gates']) {
    for (const suffix of ['', '/index.html.md']) {
      const response = await page.request.get(`/blog/${slug}${suffix}`, { maxRedirects: 0 })
      if (slug === 'daily-2026-08-11-ai-native-generation-learning-ability' && suffix === '') {
        expect(response.status()).toBe(308)
        expect(response.headers().location).toBe('/blog/daily-2026-08-11-engineering-human-override-design')
      } else {
        expect(response.status(), `${slug}${suffix}`).toBe(404)
      }
    }
  }
})

test('锐评浅色与深色主题及中等宽度可读', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto('/commentary')
    await page.evaluate((value) => localStorage.setItem('vite-ui-theme', value), theme)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('.commentary-feature h3')).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  for (const width of [768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/commentary')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.goto('/blog')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

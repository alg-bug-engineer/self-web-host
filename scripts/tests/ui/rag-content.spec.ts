import { expect, test } from '@playwright/test'

const articlePath = '/blog/rag-evaluation-01-evidence-to-answer'

test('RAG 首页入口、标签筛选与前后导航能找到完整文章', async ({ page }) => {
  await page.goto('/')
  const entry = page.locator('.home-index').getByRole('link', { name: /RAG 与知识工程/ })
  await expect(entry).toHaveAttribute('href', articlePath)
  await entry.click()
  await expect(page.locator('h1')).toHaveText('RAG 评测实战（一）：检索命中了，为什么答案还是错的？')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://ai-knowledgepoints.cn${articlePath}`)
  await page.locator('header a[href="/blog?tag=RAG"]').click()
  await expect(page.getByText('正在筛选标签:')).toBeVisible()
  await expect(page.locator(`a[href="${articlePath}"]`)).toHaveCount(1)
  await expect(page.getByText('没有找到相关文章，换个关键词试试。')).toHaveCount(0)
  await page.goBack()
  await expect(page.locator('h1')).toHaveText(/RAG 评测实战/)
  await page.goForward()
  await expect(page.getByText('正在筛选标签:')).toBeVisible()
  await expect(page.locator(`a[href="${articlePath}"]`)).toHaveCount(1)
})

test('RAG 文章图表与代码可读，公开样例和机器可读版本可访问', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(articlePath)
  await expect(page.locator('[data-article-content]')).toContainText('没有调用真实检索器或大模型')
  await expect(page.locator('[data-article-content]')).not.toContainText('**')
  const diagram = page.locator('[data-article-content] img')
  await expect.poll(() => diagram.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  expect(await page.locator('[data-article-content] pre').count()).toBe(2)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByTestId('planet-gate-inline')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '查看学习社区' })).toHaveAttribute('href', 'https://t.zsxq.com/WtjvX')
  await expect(page.locator('[data-article-content] a[href="/about#wechat"]')).toHaveCount(1)
  for (const path of ['/examples/rag-evaluation/evaluate.mjs', '/examples/rag-evaluation/fixture.json', '/images/articles/rag-evaluation-01/evaluation-flow.svg']) {
    const response = await page.request.get(path)
    expect(response.ok()).toBe(true)
  }
  const markdown = await page.request.get(`${articlePath}/index.html.md`)
  expect(markdown.ok()).toBe(true)
  expect(markdown.headers()['content-type']).toContain('text/markdown')
  expect(markdown.headers().link).toContain(`<https://ai-knowledgepoints.cn${articlePath}>; rel="canonical"`)
  expect(await markdown.text()).toContain('合成教学样例')
  for (const path of ['/sitemap.xml', '/feed.xml', '/llms.txt']) {
    const response = await page.request.get(path)
    expect(response.ok()).toBe(true)
    expect(await response.text()).toContain(articlePath)
  }
  expect(errors).toEqual([])
})

test('实践筛选包含既有工具链，搜索与重复切换不丢失条目', async ({ page }) => {
  await page.goto('/blog')
  const practice = page.getByRole('button', { name: /^Agent 与实践/ })
  const all = page.getByRole('button', { name: /^全部文章/ })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await practice.click()
    await expect(practice).toHaveAttribute('aria-pressed', 'true')
    for (const slug of ['proton-mail-claude-tutorial', 'claude2api-ide-tutorial', 'cc-switch-introduction-install-guide', 'chatgpt2api-install-guide', 'sub2api-account-management', 'claude-code-kimi-qwen-glm-guide', 'jimeng-api-local-image-generation-guide', 'claude-code-freedom-content-factory']) {
      await expect(page.locator(`a[href="/blog/${slug}"]`)).toHaveCount(1)
    }
    await page.getByLabel('搜索文章或标签').fill('sub2api')
    await expect(page.locator('a[href="/blog/sub2api-account-management"]')).toHaveCount(1)
    await expect(page.locator('a[href="/blog/claude2api-ide-tutorial"]')).toHaveCount(0)
    await page.getByLabel('搜索文章或标签').fill('')
    await all.click()
    await expect(page.locator(`a[href="${articlePath}"]`)).toHaveCount(1)
  }
})

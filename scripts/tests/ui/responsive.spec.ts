import { expect, test, type Page } from '@playwright/test'

const expectNoHorizontalOverflow = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

const collectPageErrors = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return

    const sourceURL = message.location().url
    if (!sourceURL) {
      errors.push(message.text())
      return
    }

    try {
      if (new URL(sourceURL).origin === new URL(page.url()).origin) {
        errors.push(message.text())
      }
    } catch {
      errors.push(message.text())
    }
  })
  return errors
}

test('首页在桌面和移动端保持可读且无横向溢出', async ({ page }) => {
  const errors = collectPageErrors(page)
  const response = await page.goto('/')

  expect(response?.ok()).toBe(true)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.getByRole('link', { name: /开始探索|进入知识库/ }).first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
  expect(errors).toEqual([])
})

test('首页知识图谱在浅色主题下使用浅色面板', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('vite-ui-theme', 'light'))
  await page.reload()

  const consolePanel = page.locator('.knowledge-console')
  await expect(consolePanel).toBeVisible()
  await expect(consolePanel).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(consolePanel.locator('.satellite').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(consolePanel.locator('.console-metrics > div').first()).toHaveCSS('background-color', 'rgb(247, 247, 251)')
})

test('移动菜单具备对话框语义、滚动锁定和键盘关闭', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', '仅移动端显示菜单按钮')

  await page.goto('/')
  const trigger = page.locator('button[aria-controls="mobile-navigation-dialog"]')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '网站导航' })
  await expect(dialog).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
  await expect(dialog.getByRole('link', { name: '文章' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '关闭菜单' })).toBeFocused()

  const navGroups = dialog.locator('details.mobile-nav-accordion')
  await expect(navGroups).toHaveCount(2)
  await expect(navGroups.first()).toHaveAttribute('open', '')
  await navGroups.first().locator('summary').click()
  await expect(navGroups.first()).not.toHaveAttribute('open', '')

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
})

test('最新日更文章包含完整正文结构和有效封面', async ({ page }) => {
  await page.goto('/')
  const latestDaily = page.locator('a[href^="/blog/daily-"]').first()
  await expect(latestDaily).toBeVisible()
  const href = await latestDaily.getAttribute('href')
  expect(href).toBeTruthy()

  await page.goto(href!)
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toBeVisible()
  const sectionCount = await page.locator('.prose h2').count()
  expect(sectionCount).toBeGreaterThanOrEqual(4)

  const progress = page.getByTestId('article-reading-progress')
  const readingGuide = page.getByRole('navigation', { name: '本文目录' })
  const readingGuideAccordion = page.locator('details.article-guide')
  const guideLinks = readingGuide.locator('a[href^="#"]')
  await expect(progress).toHaveCount(1)
  await expect(readingGuideAccordion).toHaveAttribute('open', '')
  await expect(readingGuide).toBeVisible()
  await expect(guideLinks).toHaveCount(sectionCount)

  for (const link of await guideLinks.all()) {
    const targetId = (await link.getAttribute('href'))?.slice(1)
    expect(targetId).toBeTruthy()
    expect(await page.evaluate((id) => Boolean(document.getElementById(id)), targetId!)).toBe(true)
  }

  const lastLink = guideLinks.last()
  const lastTargetId = (await lastLink.getAttribute('href'))!.slice(1)
  await lastLink.click()
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(lastTargetId)
  await expect.poll(() => page.evaluate((id) => {
    const top = document.getElementById(id)?.getBoundingClientRect().top
    return typeof top === 'number' && top >= 0 && top < window.innerHeight
  }, lastTargetId)).toBe(true)
  await expect.poll(() => progress.evaluate((element) => Number.parseFloat((element as HTMLElement).style.width))).toBeGreaterThan(0)
  await expectNoHorizontalOverflow(page)

  const cover = page.locator('article img').first()
  if (await cover.count()) {
    await expect.poll(() => cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    await expect(cover).toHaveCSS('object-fit', 'contain')
  }

  const markdownLink = page.locator('link[rel="alternate"][type="text/markdown"]')
  await expect(markdownLink).toHaveAttribute('href', `https://ai-knowledgepoints.cn${href}/index.html.md`)
  const markdown = await page.request.get(`${href}/index.html.md`)
  expect(markdown.status()).toBe(200)
  expect(markdown.headers()['content-type']).toContain('text/markdown')
  expect(markdown.headers().link).toContain('rel="canonical"')
  const markdownBody = await markdown.text()
  expect(markdownBody).toContain('## 正文')
  expect(markdownBody).toContain(`https://ai-knowledgepoints.cn${href}`)
  expect(markdownBody).not.toMatch(/<\/?(?:InfoCard|TwoColumnLayout|Left|Right)\b/)
})

test('旧长文保留阅读进度但不伪造目录结构', async ({ page }) => {
  const response = await page.goto('/blog/the-folding-time')

  expect(response?.ok()).toBe(true)
  await expect(page.getByTestId('article-reading-progress')).toHaveCount(1)
  await expect(page.getByRole('navigation', { name: '本文目录' })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('作品页公开作品并保持外链安全属性', async ({ page }) => {
  await page.goto('/portfolio')
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.getByText('共 5 本')).toBeVisible()
  await expect(page.getByText('ISBN 9787115668981')).toBeVisible()
  await expect(page.getByText('ISBN 9787115689856')).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute(
    'href',
    'https://ai-knowledgepoints.cn/portfolio/index.html.md',
  )
  const markdown = await page.request.get('/portfolio/index.html.md')
  expect(markdown.status()).toBe(200)
  expect(markdown.headers()['content-type']).toContain('text/markdown')
  expect(markdown.headers().link).toContain('<https://ai-knowledgepoints.cn/portfolio>; rel="canonical"')
  expect(await markdown.text()).toContain('ISBN：9787115668981')

  const externalLinks = page.locator('main a[target="_blank"]')
  expect(await externalLinks.count()).toBeGreaterThan(0)
  for (const link of await externalLinks.all()) {
    await expect(link).toHaveAttribute('rel', /noopener/)
    await expect(link).toHaveAttribute('rel', /noreferrer/)
  }
})

test('关于页展示经公开来源核对的 GitHub 信息', async ({ page }) => {
  await page.goto('/about')
  await expect(page.locator('h1')).toHaveText('芝士AI吃鱼')
  await expect(page.getByText('33', { exact: true })).toBeVisible()
  await expect(page.getByText('个 GitHub 仓库', { exact: true })).toBeVisible()
  await expect(page.getByText(/GitHub 仓库数于 2026-08-11 通过公开 API 核对/)).toBeVisible()
  await expect(page.getByText(/著作、CSDN 内容数和公众号读者数来自作者资料/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'GitHub', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '公开可核验的专业成果' })).toBeVisible()
  await expect(page.getByText('CN118861081B', { exact: false })).toBeVisible()
  await expect(page.getByText('阿里、百度、滴滴、浪潮', { exact: false }).first()).toBeVisible()
  await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute(
    'href',
    'https://ai-knowledgepoints.cn/about/index.html.md',
  )
  const markdown = await page.request.get('/about/index.html.md')
  expect(markdown.status()).toBe(200)
  expect(markdown.headers()['content-type']).toContain('text/markdown')
  expect(markdown.headers().link).toContain('<https://ai-knowledgepoints.cn/about>; rel="canonical"')
  expect(await markdown.text()).toContain('CN118861081B')
  await expectNoHorizontalOverflow(page)
})

test('RSS 与公众号长期关系入口可访问且具备受限统计标记', async ({ page }) => {
  await page.goto('/about')
  const wechatQr = page.getByRole('link', { name: '放大芝士AI吃鱼公众号二维码' }).first()
  await expect(wechatQr).toHaveAttribute('href', '/images/qrcode.jpg')
  await expect(wechatQr).toHaveAttribute('target', '_blank')
  await expect(wechatQr).toHaveAttribute('rel', /noopener/)
  await expect(wechatQr).toHaveAttribute('data-analytics-event', 'follow_wechat')
  await expect(wechatQr).toHaveAttribute('data-analytics-target', 'about-card')

  const rss = page.getByRole('link', { name: 'RSS 订阅' })
  await expect(rss).toHaveAttribute('href', '/feed.xml')
  await expect(rss).toHaveAttribute('data-analytics-event', 'subscribe_feed')
  await expect(rss).toHaveAttribute('data-analytics-target', 'footer')
  await expectNoHorizontalOverflow(page)
})

test('运维入口保持不可见且分析接口拒绝其路径', async ({ page, request }) => {
  const operator = await request.get('/operator')
  const aiOperator = await request.get('/ai-operator')
  const analytics = await request.post('/api/analytics/view', {
    data: { path: '/operator', event: 'page_view' },
  })

  expect(operator.status()).toBe(404)
  expect(aiOperator.status()).toBe(404)
  expect(analytics.status()).toBe(400)

  await page.goto('/')
  await expect(page.getByText(/自动化运维|运营控制台/)).toHaveCount(0)
})

test('监护人调研只接受固定选项并完成匿名汇总', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', '避免同一测试目录在双项目中重复提交')

  const response = await page.goto('/ai-native-generation')
  expect(response?.ok()).toBe(true)
  const survey = page.locator('#guardian-pilot-survey')
  await expect(survey.getByRole('heading', { name: '监护人匿名调研' })).toBeVisible()
  await expect(survey.getByText(/没有自由文本/)).toBeVisible()
  await expect(survey.getByText(/不保存一份可以还原到单个家庭的逐题答卷/)).toBeVisible()
  await expect(page.locator('#family-ai-check').getByText(/所有答案只在当前页面计算，不保存、不上传/)).toBeVisible()

  const fieldsets = survey.locator('fieldset')
  await expect(fieldsets).toHaveCount(8)
  for (const fieldset of await fieldsets.all()) await fieldset.getByRole('button').first().click()
  await survey.getByRole('checkbox').check()

  const submission = page.waitForResponse((candidate) =>
    candidate.url().endsWith('/api/analytics/view')
      && candidate.request().method() === 'POST'
      && candidate.request().postData()?.includes('guardian-survey') === true)
  await survey.getByRole('button', { name: '匿名提交调研' }).click()
  expect((await submission).ok()).toBe(true)
  await expect(survey.getByText(/已计入试运行汇总|本月已经收到这个浏览器的一份调研/)).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

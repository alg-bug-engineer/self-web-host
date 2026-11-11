import { expect, test, type Page } from '@playwright/test'

const seriesPath = '/planet/series/index.html'
const expectNoHorizontalOverflow = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('首页清楚展示知识星球与 20 期入口，课程可以返回主站', async ({ page }, testInfo) => {
  await page.goto('/')
  const heroEntry = page.locator('.editorial-hero').getByRole('link', { name: '知识星球 · 20 期讲解', exact: true })
  await expect(heroEntry).toBeVisible()
  await expect(heroEntry).toHaveAttribute('href', '/planet')
  await page.screenshot({ path: `/tmp/planet-navigation-home-light-${testInfo.project.name}.png`, animations: 'disabled' })

  const readingIndex = page.locator('.home-index')
  await expect(readingIndex.getByRole('link')).toHaveCount(4)
  await expect(readingIndex.getByRole('link').nth(3)).toContainText('20 期 AI 讲解')
  await expect(readingIndex.getByRole('link').nth(3)).toHaveAttribute('href', seriesPath)

  const footer = page.locator('footer')
  await expect(footer.getByRole('link', { name: '知识星球', exact: true })).toHaveAttribute('href', '/planet')
  await expect(footer.getByRole('link', { name: '20 期 AI 讲解', exact: true })).toHaveAttribute('href', seriesPath)

  await heroEntry.click()
  await expect(page).toHaveURL(/\/planet$/)
  await expect(page.getByRole('heading', { level: 1, name: '知识星球', exact: true })).toBeVisible()
  await page.screenshot({ path: `/tmp/planet-navigation-page-light-${testInfo.project.name}.png`, animations: 'disabled' })
  const course = page.getByRole('link', { name: '开始学习 →', exact: true })
  await expect(course).toHaveAttribute('href', seriesPath)
  await course.click()
  await expect(page).toHaveURL(/\/planet\/series\/index\.html$/)
  await expect(page.locator('a.episode')).toHaveCount(20)

  await page.locator('a.episode').first().click()
  await expect(page).toHaveURL(/\/planet\/series\/01\.html$/)
  const siteNav = page.locator('.series-site-nav')
  await expect(siteNav.getByRole('link', { name: '知识星球', exact: true })).toHaveAttribute('href', '/planet')
  await expect(siteNav.getByRole('link', { name: '主站首页', exact: true })).toHaveAttribute('href', '/')
  await expectNoHorizontalOverflow(page)
  await siteNav.getByRole('link', { name: '知识星球', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '知识星球', exact: true })).toBeVisible()
})

test('桌面主导航持续显示知识星球并标记当前位置', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', '桌面主导航检查')
  await page.goto('/')
  const navigation = page.getByRole('navigation', { name: '主导航', exact: true })
  const entry = navigation.getByRole('link', { name: '知识星球', exact: true })
  await expect(entry).toBeVisible()
  await expect(entry).toHaveAttribute('href', '/planet')
  await entry.click()
  await expect(entry).toHaveAttribute('aria-current', 'page')

  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(entry).toBeVisible()
  await expect(navigation.getByRole('link', { name: '文章', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: '/tmp/planet-navigation-tablet.png', animations: 'disabled' })
})

test('手机菜单在探索内容中显示知识星球并在进入后关闭', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', '手机菜单检查')
  await page.goto('/')
  const trigger = page.locator('button[aria-controls="mobile-navigation-dialog"]')
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '网站导航', exact: true })
  const contentGroup = dialog.locator('details').filter({ has: page.locator('summary', { hasText: '探索内容' }) })
  const entry = contentGroup.getByRole('link', { name: /知识星球/ })
  await expect(entry).toBeVisible()
  await expect(entry).toHaveAttribute('href', '/planet')
  await expect(entry).toContainText('20 期语音图解与 AI 实践')
  await page.screenshot({ path: '/tmp/planet-navigation-mobile-menu.png', animations: 'disabled' })
  await entry.click()
  await expect(dialog).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
  await expect(page.getByRole('heading', { level: 1, name: '知识星球', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('深色主题保留清晰的首页课程入口和栏目内容', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('vite-ui-theme', 'dark'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(13, 17, 23)')
  await expect(page.locator('.home-index').getByRole('link').nth(3)).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `/tmp/planet-navigation-home-dark-${testInfo.project.name}.png`, animations: 'disabled' })
  await page.locator('.editorial-hero').getByRole('link', { name: '知识星球 · 20 期讲解', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '知识星球', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '开始学习 →', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `/tmp/planet-navigation-page-dark-${testInfo.project.name}.png`, animations: 'disabled' })
})

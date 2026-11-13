import { expect, test, type Page } from '@playwright/test'

const universePath = '/planet/universe/index.html'

type UniverseRuntime = {
  Engine?: {
    r3d?: { renderer?: { domElement: HTMLCanvasElement }; camFlight?: unknown }
    state: { resources: { insight: number }; unlockedNodes: Set<string> }
  }
  EpisodeBridge?: { contract: boolean; listened: number; watchedEpisodes: number[]; _completed: boolean }
}

// Exercise the bundled WebGL engine on machines without a physical GPU too.
test.use({
  reducedMotion: 'reduce',
  launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
})

const ready = async (page: Page) => {
  await page.waitForFunction(() => Boolean((window as unknown as UniverseRuntime).Engine?.r3d?.renderer?.domElement))
  await expect(page.locator('#canvas-container canvas')).toBeVisible()
}

const flightSettled = async (page: Page) => {
  await page.waitForFunction(() => !(window as unknown as UniverseRuntime).Engine?.r3d?.camFlight)
}

const noOverflow = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('主站可以进入知识宇宙，并从宇宙返回首页', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  const entry = page.locator(`main a[href="${universePath}"]`).first()
  await expect(entry).toBeVisible()
  await entry.click()
  await expect(page).toHaveURL(/\/planet\/universe\/index\.html$/)
  await ready(page)
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'planet')
  await expect(page.locator('.brand-logo')).toContainText('知识宇宙')
  await expect(page.locator('#val-insight')).toContainText('30')
  await noOverflow(page)
  await page.screenshot({ path: `/tmp/knowledge-universe-planet-${testInfo.project.name}.png`, animations: 'disabled' })
  const home = page.locator('.universe-home-link')
  await expect(home).toHaveAttribute('href', '/')
  await home.click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.editorial-hero h1')).toBeVisible()
  expect(errors).toEqual([])
})

test('宇宙导航、生命树与真实关卡可操作，退出未完成关卡不发奖励', async ({ page }, testInfo) => {
  await page.goto(universePath)
  await ready(page)
  await page.locator('#btn-toggle-side').click()
  await expect(page.locator('#btn-toggle-side')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#side-panel .planet-card-item')).toHaveCount(8)
  await page.locator('#btn-toggle-side').click()
  await expect(page.locator('#btn-toggle-side')).toHaveAttribute('aria-expanded', 'false')

  await page.locator('.scale-ladder [data-go="universe"]').click()
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'universe')
  await flightSettled(page)
  await page.locator('.scale-ladder [data-go="galaxy"]').click()
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'galaxy')
  await flightSettled(page)
  await page.locator('.scale-ladder [data-go="planet"]').click()
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'planet')
  await flightSettled(page)

  await page.locator('#quest-chip').click()
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'tree')
  await expect(page.locator('#dock-title')).toContainText('词元切分')
  await expect(page.locator('#dock-action')).toHaveAttribute('data-intent', 'quiz')
  await expect(page.locator('#tree-labels .tl-node')).toHaveCount(27)
  await noOverflow(page)
  await page.screenshot({ path: `/tmp/knowledge-universe-tree-${testInfo.project.name}.png`, animations: 'disabled' })

  const before = await page.evaluate(() => {
    const state = (window as unknown as UniverseRuntime).Engine!.state
    return { insight: state.resources.insight, nodes: state.unlockedNodes.size }
  })
  await page.locator('#dock-action').click()
  await expect(page.locator('#assessment-modal')).toHaveClass(/active/)
  const options = page.locator('#assessment-modal .option-btn')
  await expect.poll(() => options.count()).toBeGreaterThanOrEqual(2)
  const optionLabels = (await options.locator('.option-text').allTextContents()).map(text => text.trim())
  expect(optionLabels.every(Boolean)).toBe(true)
  expect(new Set(optionLabels).size).toBe(optionLabels.length)
  for (const option of await options.all()) await expect(option).toBeVisible()
  await options.first().click()
  await expect(options.first()).toBeDisabled()
  await expect(page.locator('#assessment-modal .feedback-banner')).toHaveClass(/correct|wrong/)
  await expect(page.locator('#assessment-modal .feedback-banner')).not.toBeEmpty()
  await expect(page.locator('#assessment-modal .lv-next')).toBeVisible()
  await page.locator('#quiz-close').click()
  await expect(page.locator('#assessment-modal')).not.toHaveClass(/active/)
  expect(await page.evaluate(() => {
    const state = (window as unknown as UniverseRuntime).Engine!.state
    return { insight: state.resources.insight, nodes: state.unlockedNodes.size }
  })).toEqual(before)
})

test('生命树正片使用本站课程，播放契约与控制正常且短暂观看不发奖励', async ({ page }, testInfo) => {
  await page.goto(universePath)
  await ready(page)
  await page.locator('#quest-chip').click()
  await expect(page.locator('#dock-episode')).toBeVisible()
  await expect(page.locator('#ep-card-no')).toHaveText('EP04')
  await page.locator('#dock-episode').click()
  await expect(page.locator('#episode-player-overlay')).toHaveClass(/active/)
  await expect(page.locator('#episode-iframe')).toHaveAttribute('src', '/planet/series/04.html')
  await page.waitForFunction(() => (window as unknown as UniverseRuntime).EpisodeBridge?.contract === true)
  await expect(page.locator('#ep-loading-shield')).toBeHidden()
  const frame = page.frameLocator('#episode-iframe')
  await expect(frame.locator('audio')).toHaveCount(1)
  await frame.locator('#play').click()
  await expect.poll(() => frame.locator('audio').evaluate((audio: HTMLAudioElement) => !audio.paused && audio.currentTime > 0)).toBe(true)
  await page.locator('#ep-btn-rate').click()
  await expect.poll(() => frame.locator('audio').evaluate((audio: HTMLAudioElement) => audio.playbackRate)).toBe(1.25)
  await page.locator('#ep-pause').click()
  await expect.poll(() => frame.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true)
  await page.locator('#ep-play').click()
  await expect.poll(() => frame.locator('audio').evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false)
  await expect.poll(() => page.evaluate(() => (window as unknown as UniverseRuntime).EpisodeBridge!.listened)).toBeGreaterThan(0)
  expect(await page.evaluate(() => ({
    completed: (window as unknown as UniverseRuntime).EpisodeBridge!._completed,
    watched: (window as unknown as UniverseRuntime).EpisodeBridge!.watchedEpisodes.includes(4),
    insight: (window as unknown as UniverseRuntime).Engine!.state.resources.insight,
  }))).toEqual({ completed: false, watched: false, insight: 30 })
  await noOverflow(page)
  await page.screenshot({ path: `/tmp/knowledge-universe-player-${testInfo.project.name}.png`, animations: 'disabled' })
  await page.locator('#ep-close').click()
  await expect(page.locator('#episode-player-overlay')).not.toHaveClass(/active/)
  await expect(page.locator('#episode-iframe')).toHaveAttribute('src', 'about:blank')
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'tree')
})

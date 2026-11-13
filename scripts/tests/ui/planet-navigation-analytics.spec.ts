import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

// Use a normal browser signature so the API validates conversions instead of
// returning its intentional no-op response for HeadlessChrome and monitoring.
const visitorHeaders = () => ({
  'user-agent': `Mozilla/5.0 AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36 NavigationCheck/${randomUUID()}`,
  'accept-language': 'zh-CN',
})

test('知识星球各固定入口可记录转化，任意目标仍被拒绝', async ({ request }, testInfo) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), '仅本地验证，避免向生产写入人工转化')
  test.skip(testInfo.project.name !== 'desktop-chromium', 'API 合同只运行一次')

  const headers = visitorHeaders()
  const view = await request.post('/api/analytics/view', { headers, data: { path: '/' } })
  expect(view.status()).toBe(200)
  const viewResult = await view.json()
  expect(viewResult.ok).toBe(true)
  expect(viewResult.ignored).toBeUndefined()

  const acceptedTargets = [
    'home-hero', 'home-series', 'home-universe', 'planet-universe', 'header-announcement', 'header-nav', 'mobile-nav',
    'footer', 'footer-series', 'content-banner', 'tool-123456',
  ]
  for (const target of acceptedTargets) {
    const response = await request.post('/api/analytics/view', {
      headers,
      data: { kind: 'conversion', path: '/', name: 'view_planet', target },
    })
    expect(response.status(), target).toBe(200)
    expect(await response.json(), target).toMatchObject({ ok: true, name: 'view_planet', recorded: true })
  }

  for (const target of ['arbitrary-target', 'header-anywhere', 'tool-invalid']) {
    const response = await request.post('/api/analytics/view', {
      headers,
      data: { kind: 'conversion', path: '/', name: 'view_planet', target },
    })
    expect(response.status(), target).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, message: '无效转化目标' })
  }
})

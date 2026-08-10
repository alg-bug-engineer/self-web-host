#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectDir = path.resolve(import.meta.dirname, '..', '..')
const testNow = new Date('2026-08-11T12:00:00.000Z')
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'operator-evidence-report-'))
const operatorDir = path.join(dataDir, 'operator')
await fs.mkdir(operatorDir, { recursive: true })
await fs.writeFile(path.join(operatorDir, 'technical-latest.json'), JSON.stringify({
  status: 'healthy',
  checkedAt: new Date().toISOString(),
  metrics: { errors: 0, warnings: 0 },
  issues: [],
}))
await fs.writeFile(path.join(operatorDir, 'content-latest.json'), JSON.stringify({
  status: 'healthy',
  website: { latestDailyDate: new Date().toISOString().slice(0, 10), cadence7d: 7 },
  issues: [],
}))
await fs.writeFile(path.join(operatorDir, 'search-console-latest.json'), JSON.stringify({
  status: 'unconfigured',
}))

try {
  await writeAnalytics(1, 9)
  let report = await generateReport()
  assert.equal(report.version, 10)
  assert.equal(report.decision.mode, 'observe')
  assert.equal(report.decision.growthReady, false)
  assert.equal(report.status.current28DayVisitors, 9)
  assert.equal(report.status.currentMonthVisitors, null)
  assert.equal(report.status.currentMonthQualifiedVisitors, null)
  assert.equal(report.status.measurement.available, false)
  assert.equal(report.status.measurement.crossDayDeduplicated, false)
  assert.ok(report.observations.some((item) => item.includes('不根据早期噪声')))
  assert.ok(!report.recommendedActions.some((item) => ['seo', 'content', 'reading-experience', 'value-conversion'].includes(item.type)))
  assert.equal(report.topPages[0].visitorDays, 9)
  assert.equal(report.topPages[0].qualifiedVisitorDays, 1)
  assert.equal(report.topPages[0].qualificationRatePercent, 11.1)
  assert.equal(report.topPages[0].averageActiveReadingSeconds, 12)
  assert.ok(!report.topPages.some((page) => page.pathname === '/operator'))

  await writeAnalytics(8, 5, true)
  report = await generateReport()
  assert.equal(report.decision.mode, 'experiment-review')
  assert.equal(report.decision.growthReady, true)
  assert.equal(report.status.current28DayVisitorDays, 40)
  assert.equal(report.status.currentMonthVisitors, 19)
  assert.equal(report.status.currentMonthQualifiedVisitors, 1)
  assert.equal(report.status.gapToTarget, 49_999)
  assert.equal(report.status.measurement.available, true)
  assert.equal(report.status.measurement.crossDayDeduplicated, true)
  assert.equal(report.status.measurement.crossMonthLinkable, false)
  assert.equal(report.decision.primaryAction.type, 'seo')
  assert.ok(report.recommendedActions.some((item) => item.type === 'reading-experience'))
  assert.ok(report.recommendedActions.some((item) => item.type === 'value-conversion'))
  assert.ok(report.recommendedActions.some((item) => item.type === 'content'))
} finally {
  await fs.rm(dataDir, { recursive: true, force: true })
}

async function generateReport() {
  await execFileAsync(process.execPath, ['scripts/generate-operator-report.mjs'], {
    cwd: projectDir,
    env: {
      ...process.env,
      ANALYTICS_DATA_DIR: dataDir,
      OPERATOR_NOW: testNow.toISOString(),
    },
  })
  return JSON.parse(await fs.readFile(path.join(operatorDir, 'latest.json'), 'utf8'))
}

async function writeAnalytics(dayCount, visitorsPerDay, monthlyIdentity = false) {
  const days = {}
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = new Date(testNow)
    date.setUTCDate(date.getUTCDate() - offset)
    const day = date.toISOString().slice(0, 10)
    const visitors = Array.from({ length: visitorsPerDay }, (_, index) => index < 3
      ? `repeat-visitor-${index}`
      : `visitor-${offset}-${index}`)
    const invalidVisitor = `operator-probe-${offset}`
    days[day] = {
      pageViews: visitorsPerDay + 1,
      visitors: [...visitors, invalidVisitor],
      returningVisitors: [],
      paths: { '/blog/evidence': visitorsPerDay, '/operator': 1 },
      pathVisitors: { '/blog/evidence': visitors, '/operator': [invalidVisitor] },
      engagement: {
        '/blog/evidence': {
          [visitors[0]]: { seconds: 12, depth: 30 },
        },
        '/operator': {
          [invalidVisitor]: { seconds: 600, depth: 100 },
        },
      },
      sources: { direct: visitorsPerDay + 1 },
      conversions: {},
      vitals: {},
    }
  }
  await fs.writeFile(path.join(dataDir, 'analytics.json'), JSON.stringify(monthlyIdentity
    ? {
        version: 5,
        visitorIdentity: {
          scope: 'calendar-month',
          startedAt: '2026-08-01T00:00:00.000Z',
          reliableFromDay: '2026-08-01',
        },
        days,
      }
    : { version: 4, days }))
}

console.log('经营报告测试通过：月内匿名去重、迁移边界和证据门槛均可解释。')

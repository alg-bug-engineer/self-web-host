#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectDir = path.resolve(import.meta.dirname, '..', '..')
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
  assert.equal(report.version, 9)
  assert.equal(report.decision.mode, 'observe')
  assert.equal(report.decision.growthReady, false)
  assert.ok(report.observations.some((item) => item.includes('不根据早期噪声')))
  assert.ok(!report.recommendedActions.some((item) => ['seo', 'content', 'reading-experience', 'value-conversion'].includes(item.type)))
  assert.equal(report.topPages[0].visitorDays, 9)
  assert.equal(report.topPages[0].qualifiedVisitorDays, 1)
  assert.equal(report.topPages[0].qualificationRatePercent, 11.1)
  assert.equal(report.topPages[0].averageActiveReadingSeconds, 12)

  await writeAnalytics(8, 5)
  report = await generateReport()
  assert.equal(report.decision.mode, 'experiment-review')
  assert.equal(report.decision.growthReady, true)
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
    env: { ...process.env, ANALYTICS_DATA_DIR: dataDir },
  })
  return JSON.parse(await fs.readFile(path.join(operatorDir, 'latest.json'), 'utf8'))
}

async function writeAnalytics(dayCount, visitorsPerDay) {
  const days = {}
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = new Date()
    date.setUTCDate(date.getUTCDate() - offset)
    const day = date.toISOString().slice(0, 10)
    const visitors = Array.from({ length: visitorsPerDay }, (_, index) => `visitor-${offset}-${index}`)
    days[day] = {
      pageViews: visitorsPerDay,
      visitors,
      returningVisitors: [],
      paths: { '/blog/evidence': visitorsPerDay },
      pathVisitors: { '/blog/evidence': visitors },
      engagement: {
        '/blog/evidence': {
          [visitors[0]]: { seconds: 12, depth: 30 },
        },
      },
      sources: { direct: visitorsPerDay },
      conversions: {},
      vitals: {},
    }
  }
  await fs.writeFile(path.join(dataDir, 'analytics.json'), JSON.stringify({ version: 4, days }))
}

console.log('经营报告证据门槛测试通过：逐页有效阅读可解释，早期噪声不触发增长改动。')

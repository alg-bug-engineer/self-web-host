#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectDir = path.resolve(import.meta.dirname, '..', '..')
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'operator-content-report-'))
const operatorDir = path.join(dataDir, 'operator')
await fs.mkdir(operatorDir, { recursive: true })
await fs.writeFile(path.join(dataDir, 'analytics.json'), JSON.stringify({ days: {} }))
await fs.writeFile(path.join(operatorDir, 'content-latest.json'), JSON.stringify({
  version: 1,
  generatedAt: '2026-08-11T02:00:00Z',
  status: 'limited',
  website: { latestDailyDate: '2026-08-11', cadence7d: 2, todayPublished: true },
  delivery: { wechat: { status: 'draft', limitation: 'freepublish-api-unauthorized' } },
  inboundSync: { rss: { checked: true, reachable: true, loginStatus: true, feedExists: true, itemCount: 0 } },
  issues: [
    { severity: 'warning', code: 'freepublish-api-unauthorized', message: '草稿已创建但未群发。' },
    { severity: 'warning', code: 'wechat-rss-empty', message: 'Feed 暂无文章。' },
  ],
}))

try {
  await execFileAsync(process.execPath, ['scripts/generate-operator-report.mjs'], {
    cwd: projectDir,
    env: { ...process.env, ANALYTICS_DATA_DIR: dataDir },
  })
  const report = JSON.parse(await fs.readFile(path.join(operatorDir, 'latest.json'), 'utf8'))
  assert.equal(report.version, 11)
  assert.equal(report.content.status, 'limited')
  assert.ok(report.observations.some((item) => item.includes('近 7 天发布 2 天')))
  assert.ok(report.observations.some((item) => item.includes('不做频控重试')))
  assert.ok(report.recommendedActions.some((item) => item.type === 'wechat-permission'))
  assert.ok(!report.recommendedActions.some((item) => item.action.includes('循环重试')))
} finally {
  await fs.rm(dataDir, { recursive: true, force: true })
}

console.log('经营总报告内容巡检接入测试通过：公众号权限限制和 RSS 频控策略均已进入私有决策。')

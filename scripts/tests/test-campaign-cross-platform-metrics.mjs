import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const recorder = path.join(projectDir, 'scripts', 'record-campaign-cross-platform-snapshot.mjs')
const reporter = path.join(projectDir, 'scripts', 'report-campaign-cross-platform-metrics.mjs')
const sourceMetrics = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-cross-platform-metrics.json')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-cross-platform-metrics-'))

try {
  const metricsFile = path.join(tempDir, 'metrics.json')
  const logFile = path.join(tempDir, 'log.json')
  fs.copyFileSync(sourceMetrics, metricsFile)
  fs.writeFileSync(logFile, `${JSON.stringify({
    campaignId: 'ai-native-generation-30d',
    dailyRuns: [{
      date: '2026-08-12',
      externalPublishes: [{
        platform: 'x',
        calendarEntryId: 'w1-x-01',
        title: '一行家庭 AI 足迹：输入、输出、错误和检查责任',
        publishedAt: '2026-08-12T09:05:00+08:00',
        url: 'https://x.com/example/status/1',
      }, {
        platform: 'zsxq',
        calendarEntryId: 'w1-zsxq-start',
        title: '从这里开始｜10 分钟完成第一步，不需要补历史内容',
        publishedAt: '2026-08-12T09:00:00+08:00',
        url: 'https://t.zsxq.com/1uK2r',
      }],
    }],
  }, null, 2)}\n`)

  const common = [
    '--metrics-file', metricsFile,
    '--log', logFile,
    '--platform', 'x',
    '--calendar-entry', 'w1-x-01',
    '--url', 'https://x.com/example/status/1',
    '--evidence', 'visible_public_page',
  ]
  const firstMetrics = [
    '--views', '2', '--replies', '0', '--reposts', '0', '--likes', '0', '--bookmarks', 'unknown', '--linkClicks', 'unknown',
  ]
  const dryRun = runRecorder([...common, '--captured-at', '2026-08-12T09:10:00+08:00', ...firstMetrics, '--json'])
  assert.equal(dryRun.writesPerformed, false)
  assert.equal(JSON.parse(fs.readFileSync(metricsFile, 'utf8')).snapshots.length, 0)

  const first = runRecorder([...common, '--captured-at', '2026-08-12T09:10:00+08:00', ...firstMetrics, '--apply', '--json'])
  assert.equal(first.writesPerformed, true)
  assert.equal(first.snapshot.metrics.bookmarks, null)
  assert.equal(first.snapshot.metrics.linkClicks, null)

  const second = runRecorder([
    ...common,
    '--captured-at', '2026-08-12T20:00:00+08:00',
    '--views', '7', '--replies', '0', '--reposts', '1', '--likes', '1', '--bookmarks', '0', '--linkClicks', '1',
    '--apply', '--json',
  ])
  assert.equal(second.previousSnapshotAt, '2026-08-12T09:10:00+08:00')

  const report = JSON.parse(execFileSync(process.execPath, [
    reporter, '--metrics-file', metricsFile, '--as-of', '2026-08-12', '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(report.state, 'observed')
  assert.equal(report.coverage.items, 1)
  assert.equal(report.coverage.snapshots, 2)
  assert.equal(report.coverage.comparableItems, 1)
  assert.equal(report.items[0].deltas.views, 5)
  assert.equal(report.items[0].deltas.reposts, 1)
  assert.equal(report.items[0].deltas.bookmarks, null)
  assert.equal(report.items[0].deltas.linkClicks, null)
  assert.deepEqual(report.items[0].unknownLatestMetrics, [])
  assert.match(report.interpretation.join(' '), /不相加为独立人数/)
  assert.equal(report.externalWritesPerformed, false)

  const zsxqShortlink = runRecorder([
    '--metrics-file', metricsFile,
    '--log', logFile,
    '--platform', 'zsxq',
    '--calendar-entry', 'w1-zsxq-start',
    '--url', 'https://t.zsxq.com/1uK2r',
    '--captured-at', '2026-08-12T20:00:00+08:00',
    '--evidence', 'visible_public_page',
    '--reads', '1', '--comments', '0', '--likes', '0',
    '--json',
  ])
  assert.equal(zsxqShortlink.snapshot.url, 'https://t.zsxq.com/1uK2r')
  assert.equal(zsxqShortlink.writesPerformed, false)

  const missingMetric = rejectRecorder([
    ...common,
    '--captured-at', '2026-08-12T21:00:00+08:00',
    '--views', '8', '--replies', '0', '--reposts', '1', '--likes', '1', '--linkClicks', '1',
    '--json',
  ])
  assert.match(missingMetric.stderr, /缺少指标：bookmarks/)

  const wrongUrl = rejectRecorder([
    ...common.filter((value, index) => !(common[index - 1] === '--url' || value === '--url')),
    '--url', 'https://x.com/example/status/2',
    '--captured-at', '2026-08-12T21:00:00+08:00',
    '--views', '8', '--replies', '0', '--reposts', '1', '--likes', '1', '--bookmarks', '0', '--linkClicks', '1',
    '--json',
  ])
  assert.match(wrongUrl.stderr, /必须与已登记公开证据完全一致/)

  const decrease = rejectRecorder([
    ...common,
    '--captured-at', '2026-08-12T21:00:00+08:00',
    '--views', '6', '--replies', '0', '--reposts', '1', '--likes', '1', '--bookmarks', '0', '--linkClicks', '1',
    '--json',
  ])
  assert.match(decrease.stderr, /views 不能小于上一快照/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign cross-platform metrics tests passed')

function runRecorder(args) {
  return JSON.parse(execFileSync(process.execPath, [recorder, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

function rejectRecorder(args) {
  const result = spawnSync(process.execPath, [recorder, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  return result
}

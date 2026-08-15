import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'report-zsxq-activation.mjs')
const opsDir = path.join(projectDir, 'ops', 'campaigns')

const baseline = run(['--as-of', '2026-08-12', '--json'])
assert.equal(baseline.primaryAction.id, 'activate_existing_member')
assert.equal(baseline.primaryAction.execution.mode, 'publish_skip_existing_pin')
assert.equal(baseline.primaryAction.execution.pinAction, 'skip_existing_pinned_topic')
assert.equal(baseline.primaryAction.execution.preservedPinnedTopicSummary, '百度网盘学习资料入口')
assert.match(baseline.primaryAction.instruction, /已有置顶保持不变/)
assert.equal(baseline.pinPolicy.defaultAction, 'skip_existing_pinned_topic')
assert.equal(
  baseline.primaryAction.execution.publishAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-start-here-publish.txt',
)
assert.match(baseline.primaryAction.execution.firstValidReplyTemplate, /不用补充孩子个人信息/)
assert.equal(baseline.primaryAction.execution.publishNewTopic, true)
assert.equal(baseline.externalWritesPerformed, false)
assert.ok(baseline.secondaryChecks.some((item) => item.includes('不要使用课程页 UTM')))

const stale = run(['--as-of', '2026-08-15', '--json'])
assert.equal(stale.primaryAction.id, 'refresh_metrics')

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zsxq-activation-'))
try {
  const source = JSON.parse(fs.readFileSync(path.join(opsDir, 'ai-native-generation-30d-zsxq-metrics.json'), 'utf8'))
  const snapshot = source.snapshots[0]
  source.snapshots.push({
    ...structuredClone(snapshot),
    capturedAt: '2026-08-12T20:00:00+08:00',
    source: 'test fixture start partials',
    sevenDayActiveMembers: 1,
    week1MissingFieldCounts: { scene: 0, input: 1, output: 0, error: 2, checker: 0 },
  })
  const metricsFile = path.join(tempDir, 'metrics.json')
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const partialStart = run(['--as-of', '2026-08-12', '--metrics', metricsFile, '--json'])
  assert.equal(partialStart.primaryAction.id, 'repair_start_field')
  assert.match(partialStart.primaryAction.focus, /错误/)
  assert.equal(partialStart.primaryAction.execution.mode, 'reply_only')
  assert.match(partialStart.primaryAction.execution.replyTemplate, /只补“错误”/)
  assert.equal(partialStart.primaryAction.execution.publishNewTopic, false)
  assert.equal(partialStart.missingFieldChanges.error, 2)

  source.snapshots.at(-1).week1MissingFieldCounts = structuredClone(snapshot.week1MissingFieldCounts)
  source.snapshots.at(-1).content.push({
    contentId: 'w1-zsxq-start',
    calendarEntryId: 'w1-zsxq-start',
    label: '从这里开始｜10 分钟完成第一步，不需要补历史内容',
    publishedAt: '2026-08-12T09:00:00+08:00',
    publicUrl: 'https://t.zsxq.com/start1',
    reads: 1,
    comments: 0,
    likes: 0,
    validAssignments: 0,
  })
  source.snapshots.at(-1).capturedAt = '2026-08-12T11:00:00+08:00'
  source.snapshots.at(-1).sevenDayActiveMembers = 0
  source.snapshots.at(-1).startedWeek1Families = 0
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const first24h = run(['--as-of', '2026-08-12', '--metrics', metricsFile, '--json'])
  assert.equal(first24h.primaryAction.id, 'observe_first_24h')
  assert.equal(first24h.primaryAction.execution.mode, 'observe_only')
  assert.equal(first24h.primaryAction.execution.publishNewTopic, false)
  assert.equal(first24h.startTopic.elapsedHoursAtSnapshot, 2)

  source.snapshots.at(-1).capturedAt = '2026-08-13T09:05:00+08:00'
  source.snapshots.at(-1).content.at(-1).reads = 2
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const seedExample = run(['--as-of', '2026-08-13', '--metrics', metricsFile, '--json'])
  assert.equal(seedExample.primaryAction.id, 'seed_single_start_example')
  assert.equal(seedExample.primaryAction.execution.mode, 'reply_only_after_duplicate_guard')
  assert.equal(seedExample.primaryAction.execution.publishNewTopic, false)
  assert.match(seedExample.primaryAction.execution.replyTemplate, /整理三次纸飞机飞行时间/)
  assert.equal(
    seedExample.primaryAction.execution.duplicateGuard.exactMarker,
    seedExample.primaryAction.execution.replyTemplate,
  )
  assert.match(seedExample.primaryAction.stopCondition, /不得重复补示范/)

  source.snapshots.at(-1).content.at(-1).reads = 0
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const verifyVisibility = run(['--as-of', '2026-08-13', '--metrics', metricsFile, '--json'])
  assert.equal(verifyVisibility.primaryAction.id, 'verify_start_entry_visibility')
  assert.equal(verifyVisibility.primaryAction.execution.mode, 'visibility_check_only')
  assert.equal(verifyVisibility.primaryAction.execution.publishNewTopic, false)
  assert.equal(verifyVisibility.primaryAction.execution.preserveExistingPinnedTopic, true)

  source.snapshots.at(-1).capturedAt = '2026-08-12T20:00:00+08:00'
  source.snapshots.at(-1).content.at(-1).reads = 1
  source.snapshots.at(-1).startedWeek1Families = 1
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const waitForL01 = run(['--as-of', '2026-08-12', '--metrics', metricsFile, '--json'])
  assert.equal(waitForL01.primaryAction.id, 'advance_to_l01')

  source.snapshots.splice(0, source.snapshots.length, snapshot)
  Object.assign(snapshot, {
    capturedAt: '2026-08-18T08:30:00+08:00',
    source: 'test fixture',
    sevenDayActiveMembers: 1,
    startedWeek1Families: 5,
    validWeek1Families: 2,
  })
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const firstTask = run(['--as-of', '2026-08-18', '--metrics', metricsFile, '--json'])
  assert.equal(firstTask.primaryAction.id, 'repair_first_task')

  Object.assign(snapshot, {
    validWeek1Families: 5,
    challengeStartedFamilies: 4,
    challengeDay2Families: 2,
    challengeCompletedFamilies: 1,
  })
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const challenge = run(['--as-of', '2026-08-18', '--metrics', metricsFile, '--json'])
  assert.equal(challenge.primaryAction.id, 'repair_challenge')

  Object.assign(snapshot, {
    challengeDay2Families: 4,
    challengeCompletedFamilies: 4,
    campaignPaidPageVisitors: 8,
    campaignJoinClickers: 0,
  })
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const value = run(['--as-of', '2026-08-18', '--metrics', metricsFile, '--json'])
  assert.equal(value.primaryAction.id, 'repair_paid_page_value')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('ZSXQ activation tests passed')

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

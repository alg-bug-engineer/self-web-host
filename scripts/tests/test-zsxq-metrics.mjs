import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'report-zsxq-metrics.mjs')
const activationScript = path.join(projectDir, 'scripts', 'report-zsxq-activation.mjs')
const weeklyExperimentScript = path.join(projectDir, 'scripts', 'report-campaign-weekly-experiment.mjs')
const sourceFile = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-zsxq-metrics.json')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zsxq-metrics-'))
const sourceStore = JSON.parse(fs.readFileSync(sourceFile, 'utf8'))
assert.ok(sourceStore.notes.some((item) => item.includes('startedWeek1Families') && item.includes('8 月 13 日 L01')))
assert.ok(sourceStore.notes.some((item) => item.includes('validWeek1Families') && item.includes('不得复用昨天旧回复')))
assert.ok(sourceStore.notes.some((item) => item.includes('zsxqCourseInquiryFamilies') && item.includes('不保存账号或原文')))
assert.ok(sourceStore.notes.some((item) => item.includes('zsxqCourseRedirectedFamilies') && item.includes('不能大于')))

const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
assert.match(help, /默认 dry-run/)
assert.match(help, /不要采集儿童个人信息/)
assert.match(help, /四项指标缺一项就不建档/)
assert.match(help, /--content-calendar-entry/)
assert.match(help, /绑定已登记的知识星球发布证据/)

try {
  const metricsFile = path.join(tempDir, 'metrics.json')
  const snapshotFile = path.join(tempDir, 'snapshot.json')
  const logFile = path.join(tempDir, 'log.json')
  fs.copyFileSync(sourceFile, metricsFile)
  fs.writeFileSync(logFile, `${JSON.stringify({
    campaignId: 'ai-native-generation-30d',
    dailyRuns: [{
      date: '2026-08-12',
      externalPublishes: [{
        platform: 'zsxq',
        calendarEntryId: 'w1-zsxq-start',
        title: '从这里开始｜10 分钟完成第一步，不需要补历史内容',
        publishedAt: '2026-08-12T09:00:00+08:00',
        url: 'https://t.zsxq.com/testStart',
      }],
    }],
  }, null, 2)}\n`)
  const baseline = JSON.parse(fs.readFileSync(sourceFile, 'utf8')).snapshots[0]
  const activationMetricsFile = path.join(tempDir, 'activation-metrics.json')
  fs.copyFileSync(sourceFile, activationMetricsFile)
  execFileSync(process.execPath, [
    script,
    '--file', activationMetricsFile,
    '--capture-at', '2026-08-12T11:00:00+08:00',
    '--source', '知识星球起点主题可见聚合指标测试夹具',
    '--log', logFile,
    '--content-calendar-entry', 'w1-zsxq-start',
    '--content-reads', '1',
    '--content-comments', '0',
    '--content-likes', '0',
    '--content-valid-assignments', '0',
    '--apply',
  ], { cwd: projectDir, encoding: 'utf8' })
  const activationAfterCapture = JSON.parse(execFileSync(process.execPath, [
    activationScript,
    '--as-of', '2026-08-12',
    '--metrics', activationMetricsFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(activationAfterCapture.startTopic.calendarEntryId, 'w1-zsxq-start')
  assert.equal(activationAfterCapture.startTopic.elapsedHoursAtSnapshot, 2)
  assert.equal(activationAfterCapture.primaryAction.id, 'observe_first_24h')
  assert.equal(activationAfterCapture.primaryAction.execution.publishNewTopic, false)

  const next = {
    ...baseline,
    capturedAt: '2026-08-18T08:30:00+08:00',
    source: 'test fixture',
    members: 23,
    unexpiredMembers: 3,
    sevenDayActiveMembers: 2,
    monthlyActiveMembers: 2,
    totalTopics: 132,
    totalComments: 4,
    totalLikes: 3,
    cumulativeRevenueCny: 1117.04,
    thirtyDayPreviewVisitors: 30,
    thirtyDayJoinClickers: 6,
    thirtyDayPaidJoins: 2,
    campaignPaidPageVisitors: 12,
    campaignJoinClickers: 4,
    newPaidFamilies: 2,
    startedWeek1Families: 5,
    validWeek1Families: 3,
    week1MissingFieldCounts: {
      scene: 1,
      input: 2,
      output: 0,
      error: 3,
      checker: 1,
    },
    challengeStartedFamilies: 4,
    challengeDay2Families: 3,
    challengeCompletedFamilies: 3,
    researchProjectStartedFamilies: 3,
    researchLogFamilies: 2,
    researchProjectCompletedFamilies: 1,
    safetyCheckpointFamilies: 3,
    familyAgreementFamilies: 2,
    defenseCompletedFamilies: 1,
    zsxqCourseInquiryFamilies: 4,
    zsxqCourseRedirectedFamilies: 3,
    qualifiedGuardianInterests: 4,
    paidPilotFamilies: 2,
    courseStartedFamilies: 2,
    courseCompletedFamilies: 1,
    authorizedFeedbackCount: 1,
    content: baseline.content.map((item, index) => ({
      ...item,
      reads: item.reads + index + 4,
      comments: index + 1,
      likes: index,
      validAssignments: index + 1,
    })),
  }
  fs.writeFileSync(snapshotFile, `${JSON.stringify(next, null, 2)}\n`)

  execFileSync(process.execPath, [script, '--file', metricsFile, '--validate-only'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  const output = execFileSync(process.execPath, [
    script,
    '--file', metricsFile,
    '--append', snapshotFile,
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' })
  const report = JSON.parse(output)

  assert.equal(report.from, '2026-08-11T20:22:00+08:00')
  assert.equal(report.to, '2026-08-18T08:30:00+08:00')
  assert.equal(report.changes.members, 2)
  assert.equal(report.changes.cumulativeRevenueCny, 200)
  assert.equal(report.rates.sevenDayActiveRate, 0.6667)
  assert.equal(report.rates.paidPageJoinClickRate, 0.2)
  assert.equal(report.rates.joinClickPaymentRate, 0.3333)
  assert.equal(report.rates.campaignJoinClickRate, 0.3333)
  assert.equal(report.rates.firstWeekAssignmentRate, 0.6)
  assert.equal(report.rates.challengeCompletionRate, 0.75)
  assert.equal(report.rates.defenseCompletionRate, 0.3333)
  assert.equal(report.rates.guardianInterestPaymentRate, 0.5)
  assert.equal(report.rates.courseCompletionRate, 0.5)
  assert.equal(report.changes.authorizedFeedbackCount, 1)
  assert.equal(report.changes.researchProjectStartedFamilies, 3)
  assert.equal(report.changes.researchProjectCompletedFamilies, 1)
  assert.equal(report.changes.defenseCompletedFamilies, 1)
  assert.equal(report.changes.zsxqCourseInquiryFamilies, 4)
  assert.equal(report.changes.zsxqCourseRedirectedFamilies, 3)
  assert.equal(report.rates.zsxqCourseRedirectRate, 0.75)
  assert.deepEqual(report.changes.week1MissingFieldCounts, {
    scene: 1,
    input: 2,
    output: 0,
    error: 3,
    checker: 1,
  })
  assert.equal(report.contentChanges[0].readsChange, 4)
  assert.equal(JSON.parse(fs.readFileSync(metricsFile, 'utf8')).snapshots.length, 2)

  const captureArgs = [
    script,
    '--file', metricsFile,
    '--capture-at', '2026-08-18T20:00:00+08:00',
    '--source', '知识星球可见页面测试夹具',
    '--set', 'startedWeek1Families=6',
    '--set', 'zsxqCourseInquiryFamilies=5',
    '--set', 'zsxqCourseRedirectedFamilies=4',
    '--missing-scene', '1',
    '--missing-input', '2',
    '--missing-output', '1',
    '--missing-error', '4',
    '--missing-checker', '2',
    '--log', logFile,
    '--content-calendar-entry', 'w1-zsxq-start',
    '--content-reads', '3',
    '--content-comments', '1',
    '--content-likes', '0',
    '--content-valid-assignments', '1',
    '--json',
  ]
  const beforeCapture = fs.readFileSync(metricsFile, 'utf8')
  const captureDryRun = JSON.parse(execFileSync(process.execPath, captureArgs, {
    cwd: projectDir,
    encoding: 'utf8',
  }))
  assert.equal(captureDryRun.current.startedWeek1Families, 6)
  assert.equal(captureDryRun.current.zsxqCourseInquiryFamilies, 5)
  assert.equal(captureDryRun.current.zsxqCourseRedirectedFamilies, 4)
  assert.deepEqual(captureDryRun.current.week1MissingFieldCounts, {
    scene: 1,
    input: 2,
    output: 1,
    error: 4,
    checker: 2,
  })
  assert.equal(captureDryRun.current.content.at(-1).reads, 3)
  assert.equal(captureDryRun.current.content.at(-1).contentId, 'w1-zsxq-start')
  assert.equal(captureDryRun.current.content.at(-1).calendarEntryId, 'w1-zsxq-start')
  assert.equal(captureDryRun.current.content.at(-1).publishedAt, '2026-08-12T09:00:00+08:00')
  assert.equal(captureDryRun.current.content.at(-1).publicUrl, 'https://t.zsxq.com/testStart')
  assert.equal(fs.readFileSync(metricsFile, 'utf8'), beforeCapture)

  const captured = JSON.parse(execFileSync(process.execPath, [...captureArgs, '--apply'], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
  assert.equal(captured.current.startedWeek1Families, 6)
  assert.equal(captured.current.content.at(-1).validAssignments, 1)
  assert.equal(captured.contentChanges.at(-1).calendarEntryId, 'w1-zsxq-start')
  assert.equal(JSON.parse(fs.readFileSync(metricsFile, 'utf8')).snapshots.length, 3)
  const weeklyDecision = JSON.parse(execFileSync(process.execPath, [
    weeklyExperimentScript,
    '--metrics', metricsFile,
    '--as-of', '2026-08-18T20:00:00+08:00',
    '--json',
  ], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(weeklyDecision.decisionAllowed, true)
  assert.equal(weeklyDecision.evidence.formalTopicCount, 1)
  assert.equal(weeklyDecision.evidence.maximumVisibleReads, 3)
  assert.equal(weeklyDecision.recommendedBranch.id, 'keep_week2_plan')

  assert.throws(
    () => execFileSync(process.execPath, [
      script,
      '--file', metricsFile,
      '--capture-at', '2026-08-19T20:00:00+08:00',
      '--source', '知识星球可见页面测试夹具',
      '--set', 'zsxqCourseInquiryFamilies=5',
      '--set', 'zsxqCourseRedirectedFamilies=6',
    ], { cwd: projectDir, encoding: 'utf8', stdio: 'pipe' }),
    (error) => error?.status === 1 && /zsxqCourseRedirectedFamilies 不能大于 zsxqCourseInquiryFamilies/.test(error.stderr),
  )

  assert.throws(
    () => execFileSync(process.execPath, [
      script,
      '--file', metricsFile,
      '--capture-at', '2026-08-19T20:00:00+08:00',
      '--source', '知识星球可见页面测试夹具',
      '--content-id', '2026-08-19T09:00:00+08:00',
      '--content-label', '新主题但阅读数未获得',
      '--content-comments', '0',
      '--content-likes', '0',
      '--content-valid-assignments', '0',
    ], { cwd: projectDir, encoding: 'utf8', stdio: 'pipe' }),
    (error) => error?.status === 1 && /新增内容必须显式提供全部可见指标/.test(error.stderr),
  )

  assert.throws(
    () => execFileSync(process.execPath, [
      script,
      '--file', metricsFile,
      '--capture-at', '2026-08-19T20:00:00+08:00',
      '--source', '知识星球可见页面测试夹具',
      '--log', logFile,
      '--content-calendar-entry', 'w1-zsxq-missing',
      '--content-reads', '1',
      '--content-comments', '0',
      '--content-likes', '0',
      '--content-valid-assignments', '0',
    ], { cwd: projectDir, encoding: 'utf8', stdio: 'pipe' }),
    (error) => error?.status === 1 && /必须对应唯一已登记的知识星球发布证据/.test(error.stderr),
  )

  assert.throws(
    () => execFileSync(process.execPath, [script, '--file', metricsFile, '--append', snapshotFile], {
      cwd: projectDir,
      encoding: 'utf8',
      stdio: 'pipe',
    }),
    (error) => error?.status === 1 && /待追加快照必须晚于最新快照/.test(error.stderr),
  )
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('ZSXQ metric tests passed')

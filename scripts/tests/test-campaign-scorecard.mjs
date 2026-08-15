import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'report-campaign-scorecard.mjs')
const opsDir = path.join(projectDir, 'ops', 'campaigns')

const baseline = run(['--as-of', '2026-08-11', '--json'])
assert.equal(baseline.phase, 'setup')
assert.equal(metricById(baseline, 'qualifiedPaidPageVisitors').current, 0)
assert.equal(metricById(baseline, 'qualifiedPaidPageVisitors').state, 'gated')
assert.equal(metricById(baseline, 'qualifiedPaidPageVisitors').target, 150)
assert.equal(metricById(baseline, 'newPlanetPaidFamilies').target, 10)
assert.equal(metricById(baseline, 'challengeFamilies').state, 'scheduled')
assert.equal(metricById(baseline, 'paidPilotFamilies').state, 'gated')
assert.equal(metricById(baseline, 'firstWeekAssignmentRate').state, 'scheduled')
assert.deepEqual(baseline.activationFunnel, {
  startedWeek1Families: 0,
  validWeek1Families: 0,
  challengeStartedFamilies: 0,
  challengeCompletedFamilies: 0,
})
assert.deepEqual(baseline.courseIntakeFunnel, {
  zsxqInquiries: 0,
  zsxqRedirected: 0,
  zsxqRedirectRate: null,
  qualifiedGuardianInterests: 0,
  explicitOptIns: 0,
  courseStartedFamilies: 0,
  courseCompletedFamilies: 0,
})

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-scorecard-'))
try {
  const files = {
    campaign: copyJson('ai-native-generation-30d.json'),
    metrics: copyJson('ai-native-generation-30d-zsxq-metrics.json'),
    log: copyJson('ai-native-generation-30d-log.json'),
    tracking: copyJson('ai-native-generation-30d-tracking-links.json'),
    paidPilot: copyJson('ai-native-generation-30d-paid-pilot.json'),
  }
  const snapshot = files.metrics.snapshots[0]
  Object.assign(snapshot, {
    capturedAt: '2026-09-10T20:00:00+08:00',
    source: 'test fixture',
    unexpiredMembers: 10,
    sevenDayActiveMembers: 3,
    campaignPaidPageVisitors: 150,
    campaignJoinClickers: 45,
    newPaidFamilies: 10,
    startedWeek1Families: 10,
    validWeek1Families: 6,
    challengeStartedFamilies: 20,
    challengeDay2Families: 20,
    challengeCompletedFamilies: 20,
    zsxqCourseInquiryFamilies: 8,
    zsxqCourseRedirectedFamilies: 6,
    qualifiedGuardianInterests: 20,
    paidPilotFamilies: 10,
    courseStartedFamilies: 10,
    courseCompletedFamilies: 5,
    authorizedFeedbackCount: 5,
  })
  files.log.baselines.guardianSurvey.status = 'public'
  files.log.baselines.guardianSurvey.qualifiedSubmissions = 5
  files.tracking.status = 'active'
  files.paidPilot.status = 'payment_ready'
  files.paidPilot.paymentEnabled = true

  const fileArgs = []
  for (const [key, value] of Object.entries(files)) {
    const filename = path.join(tempDir, `${key}.json`)
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`)
    const flag = key === 'paidPilot' ? '--paid-pilot' : `--${key}`
    fileArgs.push(flag, filename)
  }
  const final = run(['--as-of', '2026-09-10', '--json', ...fileArgs])
  assert.equal(final.phase, 'active')
  assert.equal(metricById(final, 'qualifiedPaidPageVisitors').state, 'target_met')
  assert.equal(metricById(final, 'planetJoinClickers').state, 'target_met')
  assert.equal(metricById(final, 'newPlanetPaidFamilies').state, 'target_met')
  assert.equal(metricById(final, 'challengeFamilies').state, 'target_met')
  assert.equal(metricById(final, 'paidPilotFamilies').state, 'target_met')
  assert.equal(metricById(final, 'firstWeekAssignmentRate').current, 0.6)
  assert.equal(metricById(final, 'courseCompletionRate').current, 0.5)
  assert.equal(metricById(final, 'planetWeeklyActiveRate').current, 0.3)
  assert.equal(metricById(final, 'validParentSurveys').state, 'tracking')
  assert.deepEqual(final.activationFunnel, {
    startedWeek1Families: 10,
    validWeek1Families: 6,
    challengeStartedFamilies: 20,
    challengeCompletedFamilies: 20,
  })
  assert.deepEqual(final.courseIntakeFunnel, {
    zsxqInquiries: 8,
    zsxqRedirected: 6,
    zsxqRedirectRate: 0.75,
    qualifiedGuardianInterests: 20,
    explicitOptIns: 0,
    courseStartedFamilies: 10,
    courseCompletedFamilies: 5,
  })
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign scorecard tests passed')

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

function metricById(report, id) {
  return report.scorecard.find((item) => item.id === id)
}

function copyJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(opsDir, filename), 'utf8'))
}

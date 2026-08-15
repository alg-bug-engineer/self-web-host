import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'report-campaign-monthly-review.mjs')
const opsDir = path.join(projectDir, 'ops', 'campaigns')

const baseline = run(['--as-of', '2026-08-11', '--json'])
assert.equal(baseline.finalizationState, 'not_due')
assert.equal(baseline.decision.state, 'review_not_due')
assert.equal(baseline.contentSupply.calendars, 5)
assert.equal(baseline.contentSupply.entries, 100)
assert.equal(baseline.contentSupply.ready, 95)
assert.equal(baseline.contentSupply.blocked, 5)
assert.equal(baseline.execution.verifiedPublishes, 8)
assert.equal(baseline.execution.publishAttempts, 1)
assert.deepEqual(baseline.execution.terminalFailures, [])
assert.equal(baseline.gates.coursePagePublic, false)
assert.equal(baseline.gates.paymentEnabled, false)

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-monthly-review-'))
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
    startedWeek1Families: 20,
    validWeek1Families: 12,
    challengeStartedFamilies: 20,
    challengeDay2Families: 20,
    challengeCompletedFamilies: 20,
    researchProjectStartedFamilies: 10,
    researchLogFamilies: 8,
    researchProjectCompletedFamilies: 6,
    safetyCheckpointFamilies: 8,
    familyAgreementFamilies: 6,
    defenseCompletedFamilies: 5,
    zsxqCourseInquiryFamilies: 12,
    zsxqCourseRedirectedFamilies: 9,
    qualifiedGuardianInterests: 20,
    paidPilotFamilies: 10,
    courseStartedFamilies: 10,
    courseCompletedFamilies: 5,
    authorizedFeedbackCount: 5,
  })
  files.log.baselines.guardianSurvey.status = 'public'
  files.log.baselines.guardianSurvey.qualifiedSubmissions = 30
  files.log.dailyRuns[0].scheduledPublishes = []
  files.tracking.status = 'active'
  files.paidPilot.status = 'payment_ready'
  files.paidPilot.paymentEnabled = true
  Object.assign(files.paidPilot.offer, {
    priceCny: 299,
    startsOn: '2026-09-15',
    endsOn: '2026-10-15',
    maxFamilies: 10,
    refundPolicy: 'test fixture',
    paymentMethod: 'test fixture',
    supportResponseWindow: 'test fixture',
  })
  const fileArgs = writeFixtureFiles(files)
  const final = run(['--as-of', '2026-09-10', '--json', ...fileArgs])
  assert.equal(final.finalizationState, 'final_ready')
  assert.equal(final.decision.state, 'continue_and_scale')
  assert.equal(final.funnel.safetyAndDefense.defenseCompleted, 5)
  assert.equal(final.funnel.courseBeta.zsxqInquiries, 12)
  assert.equal(final.funnel.courseBeta.zsxqRedirected, 9)
  assert.deepEqual(final.gates.missingOfferFields, [])

  files.metrics.snapshots[0] = {
    ...copyJson('ai-native-generation-30d-zsxq-metrics.json').snapshots[0],
    capturedAt: '2026-09-10T20:00:00+08:00',
    source: 'no-signal fixture',
  }
  files.tracking = copyJson('ai-native-generation-30d-tracking-links.json')
  files.paidPilot = copyJson('ai-native-generation-30d-paid-pilot.json')
  const gatedArgs = writeFixtureFiles(files, 'gated-')
  const gated = run(['--as-of', '2026-09-10', '--json', ...gatedArgs])
  assert.equal(gated.finalizationState, 'final_ready')
  assert.equal(gated.decision.state, 'insufficient_evidence')

  files.log = copyJson('ai-native-generation-30d-log.json')
  files.log.dailyRuns[0].externalPublishes = files.log.dailyRuns[0].externalPublishes.filter((item) => item.platform !== 'csdn')
  files.log.dailyRuns[0].scheduledPublishes = [copyJson('ai-native-generation-30d-log.json').dailyRuns[0].scheduledPublishes[0]]
  files.log.dailyRuns[0].externalPublishAttempts = [{
    platform: 'csdn',
    calendarEntryId: 'w1-csdn-01',
    title: files.log.dailyRuns[0].scheduledPublishes[0].title,
    action: 'verify_scheduled',
    attemptedAt: '2026-08-12T10:30:00+08:00',
    outcome: 'scheduled_not_public',
    terminal: true,
    evidence: 'test fixture visible failure evidence',
    safeNextAction: 'test fixture keep local record',
    externalPublicationVerified: false,
  }]
  const failureArgs = writeFixtureFiles(files, 'failure-')
  const terminalFailure = run(['--as-of', '2026-09-10', '--json', ...failureArgs])
  assert.equal(terminalFailure.finalizationState, 'final_ready')
  assert.equal(terminalFailure.execution.terminalFailures.length, 1)
  assert.deepEqual(terminalFailure.execution.unresolvedScheduled, [])

  files.log.dailyRuns[0].externalPublishAttempts[0].terminal = false
  files.log.dailyRuns[0].externalPublishAttempts[0].outcome = 'risk_control'
  const retryArgs = writeFixtureFiles(files, 'retry-')
  const retryPending = run(['--as-of', '2026-09-10', '--json', ...retryArgs])
  assert.equal(retryPending.finalizationState, 'awaiting_publication_verification')
  assert.equal(retryPending.execution.unresolvedScheduled.length, 1)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign monthly review tests passed')

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

function copyJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(opsDir, filename), 'utf8'))
}

function writeFixtureFiles(files, prefix = '') {
  const args = []
  for (const [key, value] of Object.entries(files)) {
    const filename = path.join(tempDir, `${prefix}${key}.json`)
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`)
    args.push(key === 'paidPilot' ? '--paid-pilot' : `--${key}`, filename)
  }
  return args
}

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'prepare-campaign-monthly-review-article.mjs')
const opsDir = path.join(projectDir, 'ops', 'campaigns')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-monthly-review-article-'))

try {
  const earlyOutput = path.join(tempDir, 'early.mdx')
  const early = run(['--as-of', '2026-08-12', '--output', earlyOutput, '--apply', '--json'])
  assert.equal(early.state, 'blocked_final_evidence')
  assert.equal(early.finalizationState, 'not_due')
  assert.equal(early.content, null)
  assert.equal(early.writesPerformed, false)
  assert.equal(fs.existsSync(earlyOutput), false)

  const metrics = copyJson('ai-native-generation-30d-zsxq-metrics.json')
  metrics.snapshots[0] = {
    ...metrics.snapshots[0],
    capturedAt: '2026-09-10T20:00:00+08:00',
    source: 'test fixture aggregated visible metrics',
    unexpiredMembers: 4,
    sevenDayActiveMembers: 2,
    startedWeek1Families: 3,
    validWeek1Families: 2,
    challengeStartedFamilies: 2,
    challengeDay2Families: 1,
    challengeCompletedFamilies: 1,
    researchProjectStartedFamilies: 1,
    researchLogFamilies: 1,
    researchProjectCompletedFamilies: 1,
    safetyCheckpointFamilies: 1,
    familyAgreementFamilies: 1,
    defenseCompletedFamilies: 1,
    qualifiedGuardianInterests: 1,
    newPaidFamilies: 0,
    paidPilotFamilies: 0,
    courseStartedFamilies: 1,
    courseCompletedFamilies: 0,
    authorizedFeedbackCount: 0,
  }
  const log = copyJson('ai-native-generation-30d-log.json')
  for (const dailyRun of log.dailyRuns || []) dailyRun.scheduledPublishes = []
  log.dailyRuns[0].externalPublishAttempts = [{
    platform: 'x',
    calendarEntryId: 'w1-x-01',
    title: '测试未发布内容',
    action: 'publish',
    attemptedAt: '2026-08-12T09:05:00+08:00',
    outcome: 'platform_rejected',
    terminal: true,
    evidence: 'test fixture visible failure evidence',
    safeNextAction: '保留本地草稿，不重发。',
    externalPublicationVerified: false,
  }]
  const metricsFile = writeJson('metrics.json', metrics)
  const logFile = writeJson('log.json', log)
  const output = path.join(tempDir, 'final-review.mdx')
  const common = [
    '--as-of', '2026-09-10',
    '--metrics', metricsFile,
    '--log', logFile,
    '--output', output,
    '--json',
  ]

  const dryRun = run(common)
  assert.equal(dryRun.state, 'draft_ready')
  assert.equal(dryRun.finalizationState, 'final_ready')
  assert.equal(dryRun.decision.state, 'continue_with_funnel_repair')
  assert.equal(dryRun.writesPerformed, false)
  assert.equal(fs.existsSync(output), false)
  assert.match(dryRun.content, /^---\n/)
  assert.match(dryRun.content, /published: false/)
  assert.match(dryRun.content, /继续，但只修一个漏斗断点/)
  assert.match(dryRun.content, /第一周：明确开始 3 个家庭，有效完成 2 个家庭/)
  assert.match(dryRun.content, /未发布与终局失败/)
  assert.match(dryRun.content, /测试未发布内容/)
  assert.match(dryRun.content, /platform_rejected/)
  assert.match(dryRun.content, /不计入“已核验发布”/)
  assert.match(dryRun.content, /儿童AI内测-网站/)
  assert.match(dryRun.publicationGate, /网站部署授权/)
  assert.match(dryRun.contentSha256, /^[a-f0-9]{64}$/)
  assert.equal(dryRun.content.includes('undefined'), false)

  const applied = run([...common, '--apply'])
  assert.equal(applied.writesPerformed, true)
  assert.equal(fs.readFileSync(output, 'utf8'), applied.content)

  const duplicate = spawnSync(process.execPath, [script, ...common, '--apply'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.notEqual(duplicate.status, 0)
  assert.match(duplicate.stderr, /EEXIST/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign monthly review article tests passed')

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

function copyJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(opsDir, filename), 'utf8'))
}

function writeJson(filename, value) {
  const file = path.join(tempDir, filename)
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  return file
}

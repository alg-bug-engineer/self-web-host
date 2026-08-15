import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'record-guardian-intake-summary.mjs')
const scorecardScript = path.join(projectDir, 'scripts', 'report-campaign-scorecard.mjs')
const monthlyScript = path.join(projectDir, 'scripts', 'report-campaign-monthly-review.mjs')
const operatorScript = path.join(projectDir, 'scripts', 'generate-campaign-operator-pack.mjs')
const activationScript = path.join(projectDir, 'scripts', 'report-zsxq-activation.mjs')
const source = path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-guardian-intake.json')
const sourceIntake = JSON.parse(fs.readFileSync(source, 'utf8'))
assert.deepEqual(sourceIntake.minimumFields, ['ageBand', 'weeklyTime', 'participationPreference'])
assert.deepEqual(sourceIntake.fieldOptions.participationPreference, ['异步任务', '集中答疑', '两者都可'])
assert.equal(sourceIntake.collectionChannel, '公众号可见私信人工核验')
assert.equal(sourceIntake.referralCodes['儿童AI内测-星球'], 'zsxq')
assert.equal(sourceIntake.referralCodes['儿童AI内测'], 'unattributed')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-intake-summary-'))
const file = path.join(tempDir, 'intake.json')
fs.copyFileSync(source, file)

try {
  const common = [
    '--captured-at', '2026-08-31T20:00:00+08:00',
    '--new-qualified', '3',
    '--incomplete', '1',
    '--duplicate', '1',
    '--ineligible', '1',
    '--withdrawn', '0',
    '--age-8-10', '1', '--age-11-12', '1', '--age-13-14', '1',
    '--time-under-30', '0', '--time-30-60', '2', '--time-60-90', '1',
    '--pref-async', '1', '--pref-office-hours', '0', '--pref-both', '2',
    '--origin-zsxq', '2', '--origin-wechat', '1', '--origin-x', '0',
    '--origin-csdn', '0', '--origin-toutiao', '0', '--origin-website', '0', '--origin-unattributed', '0',
    '--file', file,
    '--json',
  ]
  const before = fs.readFileSync(file, 'utf8')
  const dryRun = run(common)
  assert.equal(dryRun.mode, 'dry_run')
  assert.equal(dryRun.snapshot.reviewedInquiries, 6)
  assert.equal(dryRun.snapshot.activeQualifiedInterests, 3)
  assert.deepEqual(dryRun.snapshot.attributionOrigin, {
    zsxq: 2,
    wechat: 1,
    x: 0,
    csdn: 0,
    toutiao: 0,
    website: 0,
    unattributed: 0,
  })
  assert.equal(fs.readFileSync(file, 'utf8'), before)

  const applied = run([...common, '--apply'])
  assert.equal(applied.writesPerformed, true)
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(stored.status, 'collecting')
  assert.equal(stored.snapshots.length, 1)
  assert.equal(stored.snapshots[0].containsIdentifiersOrMessageText, false)

  const scorecard = runScript(scorecardScript, [
    '--as-of', '2026-08-31', '--guardian-intake', file, '--json',
  ])
  assert.equal(scorecard.guardianIntake.activeQualifiedInterests, 3)
  assert.equal(scorecard.guardianIntake.acquisitionOriginTotals.zsxq, 2)
  assert.equal(scorecard.guardianIntake.acquisitionOriginTotals.wechat, 1)
  assert.equal(
    scorecard.scorecard.find((item) => item.id === 'qualifiedGuardianInterests').current,
    3,
  )

  const operator = runScript(operatorScript, [
    '--date', '2026-08-31', '--guardian-intake', file, '--json',
  ])
  assert.equal(operator.latestMetrics.qualifiedGuardianInterests, 3)
  assert.equal(operator.guardianIntake.source, '公众号后台可见私信人工汇总')
  assert.equal(operator.guardianIntake.latestNewQualifiedOrigins.zsxq, 2)
  assert.equal(operator.guardianIntake.referralCodes['儿童AI内测-星球'], 'zsxq')
  assert.match(operator.guardianIntake.recordCommandTemplate, /--origin-zsxq <COUNT>/)
  assert.match(operator.guardianIntake.recordCommandTemplate, /--origin-unattributed <COUNT>/)
  assert.ok(operator.operatorChecks.some((item) =>
    item.includes('七个来源字段之和必须等于新增有效意向')
    && item.includes('无法确认时记 origin-unattributed')
  ))

  const monthly = runScript(monthlyScript, [
    '--as-of', '2026-08-31', '--guardian-intake', file, '--json',
  ])
  assert.equal(monthly.funnel.courseBeta.guardianInterests, 3)
  assert.equal(monthly.guardianIntake.acquisitionOriginTotals.zsxq, 2)

  const activationMetrics = JSON.parse(fs.readFileSync(
    path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-zsxq-metrics.json'),
    'utf8',
  ))
  Object.assign(activationMetrics.snapshots[0], {
    capturedAt: '2026-08-31T20:00:00+08:00',
    unexpiredMembers: 0,
    sevenDayActiveMembers: 0,
  })
  const activationMetricsFile = path.join(tempDir, 'activation-metrics.json')
  fs.writeFileSync(activationMetricsFile, `${JSON.stringify(activationMetrics, null, 2)}\n`)
  const activation = runScript(activationScript, [
    '--as-of', '2026-08-31',
    '--metrics', activationMetricsFile,
    '--guardian-intake', file,
    '--json',
  ])
  assert.equal(activation.primaryAction.id, 'complete_offer_gates')
  assert.equal(activation.guardianIntake.activeQualifiedInterests, 3)

  const invalidDistribution = spawnSync(process.execPath, [script,
    '--captured-at', '2026-09-01T20:00:00+08:00',
    '--new-qualified', '1',
    '--age-8-10', '0', '--age-11-12', '0', '--age-13-14', '0',
    '--time-under-30', '0', '--time-30-60', '1', '--time-60-90', '0',
    '--pref-async', '1', '--pref-office-hours', '0', '--pref-both', '0',
    '--file', file,
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(invalidDistribution.status, 1)
  assert.match(invalidDistribution.stderr, /年龄段分布合计/)

  const invalidOriginDistribution = spawnSync(process.execPath, [script,
    '--captured-at', '2026-09-01T20:00:00+08:00',
    '--new-qualified', '1',
    '--age-8-10', '1', '--age-11-12', '0', '--age-13-14', '0',
    '--time-under-30', '0', '--time-30-60', '1', '--time-60-90', '0',
    '--pref-async', '1', '--pref-office-hours', '0', '--pref-both', '0',
    '--file', file,
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(invalidOriginDistribution.status, 1)
  assert.match(invalidOriginDistribution.stderr, /来源归因分布合计/)

  const withdrawal = run([
    '--captured-at', '2026-09-01T20:00:00+08:00',
    '--withdrawn', '1',
    '--file', file,
    '--json', '--apply',
  ])
  assert.equal(withdrawal.snapshot.activeQualifiedInterests, 2)

  const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
  assert.match(help, /默认 dry-run/)
  assert.match(help, /--origin-unattributed/)
  assert.match(help, /不得猜测/)
  assert.match(help, /不得传入昵称、账号、消息原文或儿童资料/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('guardian intake summary tests passed')

function run(args) {
  return runScript(script, args)
}

function runScript(filename, args) {
  return JSON.parse(execFileSync(process.execPath, [filename, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

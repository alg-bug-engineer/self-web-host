import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'record-campaign-course-progress.mjs')
const scorecardScript = path.join(projectDir, 'scripts', 'report-campaign-scorecard.mjs')
const monthlyScript = path.join(projectDir, 'scripts', 'report-campaign-monthly-review.mjs')
const operatorScript = path.join(projectDir, 'scripts', 'generate-campaign-operator-pack.mjs')
const activationScript = path.join(projectDir, 'scripts', 'report-zsxq-activation.mjs')
const source = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-course-progress.json')
const guardianIntakeSource = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-guardian-intake.json')
const card = path.join(projectDir, 'content', 'campaigns', 'ai-native-generation-30d', 'course-beta-free-trial-start-and-progress-card.md')
const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
assert.match(help, /默认 dry-run/)
assert.match(help, /公开视频播放、阅读、点赞、旧作业或星主示范不计课程开始/)
assert.match(fs.readFileSync(card, 'utf8'), /愿意参加免费研究型试学/)
assert.match(fs.readFileSync(card, 'utf8'), /不保存这句话、账号或昵称/)

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-course-progress-'))
try {
  const file = path.join(tempDir, 'progress.json')
  const guardianIntakeFile = path.join(tempDir, 'guardian-intake.json')
  fs.copyFileSync(source, file)
  const guardianIntake = JSON.parse(fs.readFileSync(guardianIntakeSource, 'utf8'))
  guardianIntake.status = 'collecting'
  guardianIntake.snapshots.push({
    capturedAt: '2026-08-15T19:00:00+08:00',
    source: 'test fixture visible aggregate',
    activeQualifiedInterests: 3,
    attributionOrigin: { zsxq: 1, wechat: 2, x: 0, csdn: 0, toutiao: 0, website: 0, unattributed: 0 },
    containsIdentifiersOrMessageText: false,
  })
  fs.writeFileSync(guardianIntakeFile, `${JSON.stringify(guardianIntake, null, 2)}\n`)
  const common = [
    '--file', file,
    '--guardian-intake', guardianIntakeFile,
    '--captured-at', '2026-08-15T20:00:00+08:00',
    '--new-invited', '3',
    '--new-opt-ins', '2',
    '--new-started', '1',
    '--new-completed', '0',
    '--withdrawn-before-start', '0',
    '--withdrawn-after-start', '0',
    '--json',
  ]
  const before = fs.readFileSync(file, 'utf8')
  const dryRun = run(common)
  assert.equal(dryRun.mode, 'dry_run')
  assert.equal(dryRun.writesPerformed, false)
  assert.equal(dryRun.snapshot.totalInvited, 3)
  assert.equal(dryRun.snapshot.explicitOptIns, 2)
  assert.equal(dryRun.snapshot.courseStartedFamilies, 1)
  assert.equal(dryRun.snapshot.activeCourseFamilies, 1)
  assert.equal(dryRun.snapshot.containsIdentifiersOrMessageText, false)
  assert.equal(dryRun.qualifiedGuardianInterestsEver, 3)
  assert.equal(fs.readFileSync(file, 'utf8'), before)

  const applied = run([...common, '--apply'])
  assert.equal(applied.writesPerformed, true)
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(stored.status, 'collecting')
  assert.equal(stored.snapshots.length, 1)

  const completed = run([
    '--file', file,
    '--guardian-intake', guardianIntakeFile,
    '--captured-at', '2026-09-07T20:00:00+08:00',
    '--new-invited', '0',
    '--new-opt-ins', '0',
    '--new-started', '1',
    '--new-completed', '1',
    '--withdrawn-before-start', '0',
    '--withdrawn-after-start', '0',
    '--json',
    '--apply',
  ])
  assert.equal(completed.snapshot.courseStartedFamilies, 2)
  assert.equal(completed.snapshot.courseCompletedFamilies, 1)
  assert.equal(completed.snapshot.activeCourseFamilies, 1)

  const scorecard = runReport(scorecardScript, [
    '--as-of', '2026-09-07', '--course-progress', file, '--json',
  ])
  assert.equal(scorecard.courseProgress.courseStartedFamilies, 2)
  assert.equal(scorecard.courseProgress.courseCompletedFamilies, 1)
  assert.equal(scorecard.scorecard.find((item) => item.id === 'courseCompletionRate').current, 0.5)

  const operator = runReport(operatorScript, [
    '--date', '2026-09-07', '--course-progress', file, '--json',
  ])
  assert.equal(operator.latestMetrics.courseStartedFamilies, 2)
  assert.equal(operator.latestMetrics.courseCompletedFamilies, 1)
  assert.match(operator.courseProgress.recordCommandTemplate, /record-campaign-course-progress\.mjs/)
  assert.ok(operator.operatorChecks.some((item) =>
    item.includes('确认后新任务') && item.includes('不计课程开始')
  ))

  const monthly = runReport(monthlyScript, [
    '--as-of', '2026-09-07', '--course-progress', file, '--json',
  ])
  assert.equal(monthly.funnel.courseBeta.started, 2)
  assert.equal(monthly.funnel.courseBeta.completed, 1)

  const activation = runReport(activationScript, [
    '--as-of', '2026-09-07', '--course-progress', file, '--json',
  ])
  assert.equal(activation.courseProgress.courseStartedFamilies, 2)
  assert.equal(activation.courseProgress.courseCompletedFamilies, 1)

  const tooManyStarts = spawnSync(process.execPath, [script,
    '--file', file,
    '--guardian-intake', guardianIntakeFile,
    '--captured-at', '2026-09-08T20:00:00+08:00',
    '--new-started', '1',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(tooManyStarts.status, 1)
  assert.match(tooManyStarts.stderr, /courseStartedFamilies 不能大于明确参与/)

  const tooManyOutcomes = spawnSync(process.execPath, [script,
    '--file', file,
    '--guardian-intake', guardianIntakeFile,
    '--captured-at', '2026-09-08T20:00:00+08:00',
    '--new-completed', '2',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(tooManyOutcomes.status, 1)
  assert.match(tooManyOutcomes.stderr, /课程完成与开始后退出合计不能大于课程开始/)

  const stale = spawnSync(process.execPath, [script,
    '--file', file,
    '--guardian-intake', guardianIntakeFile,
    '--captured-at', '2026-09-07T20:00:00+08:00',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(stale.status, 1)
  assert.match(stale.stderr, /必须晚于上一快照/)

  const tooManyInvites = spawnSync(process.execPath, [script,
    '--file', file,
    '--guardian-intake', guardianIntakeFile,
    '--captured-at', '2026-09-08T20:00:00+08:00',
    '--new-invited', '1',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(tooManyInvites.status, 1)
  assert.match(tooManyInvites.stderr, /不能大于意向台账累计有效意向/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign course progress tests passed')

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

function runReport(filename, args) {
  return JSON.parse(execFileSync(process.execPath, [filename, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

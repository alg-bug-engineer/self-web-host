import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const reporter = path.join(projectDir, 'scripts', 'report-campaign-weekly-experiment.mjs')
const recorder = path.join(projectDir, 'scripts', 'record-campaign-weekly-experiment.mjs')
const sourceRegistry = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-weekly-experiments.json')
const sourceMetrics = path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-zsxq-metrics.json')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-weekly-experiment-'))

try {
  const registryFile = path.join(tempDir, 'registry.json')
  const metricsFile = path.join(tempDir, 'metrics.json')
  fs.copyFileSync(sourceRegistry, registryFile)
  fs.copyFileSync(sourceMetrics, metricsFile)

  const collecting = report(registryFile, metricsFile, '2026-08-12')
  assert.equal(collecting.state, 'collecting')
  assert.equal(collecting.decisionAllowed, false)
  assert.equal(collecting.recommendedBranch, null)
  assert.match(collecting.reason, /此前不调整下一周内容/)

  const incomplete = report(registryFile, metricsFile, '2026-08-18T20:00:00+08:00')
  assert.equal(incomplete.state, 'evidence_incomplete')
  assert.equal(incomplete.decisionAllowed, false)

  const source = JSON.parse(fs.readFileSync(sourceMetrics, 'utf8'))
  const base = structuredClone(source.snapshots[0])
  const snapshot = {
    ...base,
    capturedAt: '2026-08-18T19:55:00+08:00',
    source: 'test visible admin aggregate',
    startedWeek1Families: 0,
    validWeek1Families: 0,
    content: [{
      calendarEntryId: 'w1-zsxq-start',
      contentId: 'topic-test',
      label: '从这里开始',
      reads: 0,
      comments: 0,
      likes: 0,
      validAssignments: 0,
    }],
  }
  source.snapshots.push(snapshot)
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)

  const noReach = report(registryFile, metricsFile, '2026-08-18T20:00:00+08:00')
  assert.equal(noReach.decisionAllowed, true)
  assert.equal(noReach.recommendedBranch.id, 'fix_entry_visibility')
  assert.match(noReach.recordCommand, /--branch fix_entry_visibility/)

  snapshot.content[0].reads = 4
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const noStart = report(registryFile, metricsFile, '2026-08-18T20:00:00+08:00')
  assert.equal(noStart.recommendedBranch.id, 'simplify_first_response')

  snapshot.startedWeek1Families = 2
  snapshot.validWeek1Families = 1
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const partial = report(registryFile, metricsFile, '2026-08-18T20:00:00+08:00')
  assert.equal(partial.recommendedBranch.id, 'repair_one_missing_field')

  snapshot.startedWeek1Families = 3
  snapshot.validWeek1Families = 3
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const success = report(registryFile, metricsFile, '2026-08-18T20:00:00+08:00')
  assert.equal(success.recommendedBranch.id, 'keep_week2_plan')
  assert.equal(success.recommendedBranch.changedVariable, null)

  const dryRun = record(registryFile, metricsFile, [
    '--week', '1', '--branch', 'keep_week2_plan',
    '--decided-at', '2026-08-18T20:00:00+08:00',
    '--evidence-snapshot', '2026-08-18T19:55:00+08:00', '--json',
  ])
  assert.equal(dryRun.writesPerformed, false)
  assert.equal(JSON.parse(fs.readFileSync(registryFile, 'utf8')).experiments[0].selectedBranch, null)

  const mismatch = rejectRecord(registryFile, metricsFile, [
    '--week', '1', '--branch', 'simplify_first_response',
    '--decided-at', '2026-08-18T20:00:00+08:00',
    '--evidence-snapshot', '2026-08-18T19:55:00+08:00', '--json',
  ])
  assert.match(mismatch.stderr, /分支与证据建议不一致/)

  const applied = record(registryFile, metricsFile, [
    '--week', '1', '--branch', 'keep_week2_plan',
    '--decided-at', '2026-08-18T20:00:00+08:00',
    '--evidence-snapshot', '2026-08-18T19:55:00+08:00', '--apply', '--json',
  ])
  assert.equal(applied.writesPerformed, true)
  const saved = JSON.parse(fs.readFileSync(registryFile, 'utf8')).experiments[0]
  assert.equal(saved.status, 'decided')
  assert.equal(saved.selectedBranch.id, 'keep_week2_plan')
  assert.equal(saved.selectedBranch.changedVariable, null)
  const initializedWeek2 = JSON.parse(fs.readFileSync(registryFile, 'utf8')).experiments[1]
  assert.equal(initializedWeek2.status, 'collecting')
  assert.equal(initializedWeek2.currentExperiment.primaryMetric, 'challengeCompletedFamilies')
  const week2Collecting = report(registryFile, metricsFile, '2026-08-19')
  assert.equal(week2Collecting.state, 'collecting')
  assert.equal(week2Collecting.decisionAllowed, false)

  source.snapshots.push({
    ...base,
    capturedAt: '2026-08-25T19:55:00+08:00',
    source: 'test week 2 visible admin aggregate',
    challengeStartedFamilies: 0,
    challengeDay2Families: 0,
    challengeCompletedFamilies: 0,
    content: [
      {
        calendarEntryId: 'w1-zsxq-start',
        contentId: 'old-week-1-topic',
        label: '第一周旧主题',
        reads: 9,
        comments: 2,
        likes: 0,
        validAssignments: 1,
      },
      {
        calendarEntryId: 'w2-zsxq-01',
        contentId: 'current-week-2-topic',
        label: '第二周正式主题',
        reads: 0,
        comments: 0,
        likes: 0,
        validAssignments: 0,
      },
    ],
  })
  fs.writeFileSync(metricsFile, `${JSON.stringify(source, null, 2)}\n`)
  const week2NoReach = report(registryFile, metricsFile, '2026-08-25T20:00:00+08:00')
  assert.equal(week2NoReach.decisionAllowed, true)
  assert.equal(week2NoReach.evidence.formalTopicCount, 1)
  assert.equal(week2NoReach.evidence.maximumVisibleReads, 0)
  assert.equal(week2NoReach.recommendedBranch.id, 'fix_week2_entry_visibility')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign weekly experiment tests passed')

function report(registry, metrics, asOf) {
  return JSON.parse(execFileSync(process.execPath, [reporter, '--registry', registry, '--metrics', metrics, '--as-of', asOf, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

function record(registry, metrics, args) {
  return JSON.parse(execFileSync(process.execPath, [recorder, '--registry', registry, '--metrics', metrics, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

function rejectRecord(registry, metrics, args) {
  const result = spawnSync(process.execPath, [recorder, '--registry', registry, '--metrics', metrics, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.notEqual(result.status, 0)
  return result
}

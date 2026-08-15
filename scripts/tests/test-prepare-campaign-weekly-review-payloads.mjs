import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'prepare-campaign-weekly-review-payloads.mjs')
const opsDir = path.join(projectDir, 'ops', 'campaigns')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-weekly-review-payloads-'))

try {
  const early = run(['--week', '1', '--as-of', '2026-08-18T19:59:00+08:00', '--output-dir', tempDir, '--json'])
  assert.equal(early.state, 'not_due')
  assert.deepEqual(early.outputs, [])

  const limited = run(['--week', '1', '--as-of', '2026-08-18T20:00:00+08:00', '--output-dir', tempDir, '--json'])
  assert.equal(limited.state, 'draft_ready_evidence_limited')
  assert.equal(limited.outputs.length, 2)
  assert.ok(limited.outputs.every((item) => !/【|__|待核验/.test(item.content)))
  assert.match(limited.outputs.find((item) => item.platform === 'x').content, /不报告家庭数或完成率/)
  assert.ok([...limited.outputs.find((item) => item.platform === 'x').content].length <= 280)

  const metrics = JSON.parse(fs.readFileSync(path.join(opsDir, 'ai-native-generation-30d-zsxq-metrics.json'), 'utf8'))
  metrics.snapshots.push({
    ...structuredClone(metrics.snapshots[0]),
    capturedAt: '2026-08-18T19:55:00+08:00',
    source: 'test visible weekly snapshot',
    startedWeek1Families: 3,
    validWeek1Families: 3,
    content: [{
      calendarEntryId: 'w1-zsxq-start',
      contentId: 'test-topic',
      label: '第一周正式主题',
      reads: 4,
      comments: 3,
      likes: 0,
      validAssignments: 3,
    }],
  })
  const metricsFile = path.join(tempDir, 'metrics.json')
  fs.writeFileSync(metricsFile, JSON.stringify(metrics))
  const awaiting = run(['--week', '1', '--as-of', '2026-08-18T20:00:00+08:00', '--metrics', metricsFile, '--output-dir', tempDir, '--json'])
  assert.equal(awaiting.state, 'awaiting_branch_record')
  assert.equal(awaiting.recommendedBranch, 'keep_week2_plan')
  assert.equal(awaiting.outputs.length, 0)

  const registry = JSON.parse(fs.readFileSync(path.join(opsDir, 'ai-native-generation-30d-weekly-experiments.json'), 'utf8'))
  const experiment = registry.experiments[0]
  experiment.status = 'decided'
  experiment.selectedBranch = {
    id: 'keep_week2_plan',
    changedVariable: null,
    decidedAt: '2026-08-18T20:00:00+08:00',
  }
  experiment.decisionEvidence = {
    capturedAt: '2026-08-18T19:55:00+08:00',
    source: 'test visible weekly snapshot',
    formalTopicCount: 1,
    readsKnown: true,
    maximumVisibleReads: 4,
    visibleComments: 3,
    stageMetrics: {
      started: { field: 'startedWeek1Families', value: 3 },
      completed: { field: 'validWeek1Families', value: 3 },
    },
  }
  const registryFile = path.join(tempDir, 'registry.json')
  fs.writeFileSync(registryFile, JSON.stringify(registry))
  const decidedDir = path.join(tempDir, 'decided')
  const decided = run(['--week', '1', '--as-of', '2026-08-18T20:01:00+08:00', '--metrics', metricsFile, '--registry', registryFile, '--output-dir', decidedDir, '--apply', '--json'])
  assert.equal(decided.state, 'draft_ready_decided')
  assert.equal(decided.writesPerformed, true)
  assert.equal(decided.outputs.length, 2)
  assert.ok(decided.outputs.every((item) => fs.existsSync(path.join(projectDir, item.file))))
  assert.match(decided.outputs.find((item) => item.platform === 'x').content, /明确开始 3，有效完成 3/)
  assert.match(decided.outputs.find((item) => item.platform === 'zsxq').content, /保持 L04—L06 原计划/)
  assert.ok(decided.outputs.every((item) => /^[a-f0-9]{64}$/.test(item.contentSha256)))

  const duplicate = spawnSync(process.execPath, [script, '--week', '1', '--as-of', '2026-08-18T20:01:00+08:00', '--metrics', metricsFile, '--registry', registryFile, '--output-dir', decidedDir, '--apply', '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.notEqual(duplicate.status, 0)
  assert.match(duplicate.stderr, /EEXIST/)

  const week2 = run(['--week', '2', '--as-of', '2026-08-25T20:00:00+08:00', '--output-dir', tempDir, '--json'])
  assert.equal(week2.state, 'draft_ready_evidence_limited')
  assert.equal(week2.outputs.length, 2)

  const week4 = run(['--week', '4', '--as-of', '2026-09-08T20:00:00+08:00', '--output-dir', tempDir, '--json'])
  assert.equal(week4.state, 'draft_ready_evidence_limited')
  assert.equal(week4.outputs.length, 1)
  assert.equal(week4.outputs[0].platform, 'zsxq')
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign weekly review payload tests passed')

function run(args) {
  return JSON.parse(execFileSync(process.execPath, [script, ...args], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

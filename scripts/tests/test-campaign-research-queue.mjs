import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'report-campaign-research-queue.mjs')

const current = run('2026-08-12')
assert.equal(current.state, 'ready')
assert.deepEqual(current.counts, { tasks: 6, completed: 1, planned: 5, due: 0 })
assert.equal(current.nextTask.id, 'R01')
assert.equal(current.execution.mode, 'wait_until_due')
assert.equal(current.externalWritesPerformed, false)
assert.deepEqual(current.missingOutputs, [])
assert.deepEqual(current.missingExecutionPacks, [])
assert.deepEqual(current.executionPackChecks, [{
  taskId: 'R01',
  asset: 'content/campaigns/ai-native-generation-30d/2026-08-13-notebooklm-r01-execution-pack.md',
  missingMarkers: [],
}])
assert.deepEqual(current.invalid, [])

const firstDue = run('2026-08-13')
assert.equal(firstDue.counts.due, 1)
assert.equal(firstDue.execution.mode, 'visible_browser_only')
assert.equal(firstDue.execution.taskId, 'R01')
assert.equal(
  firstDue.dueTasks[0].executionPack,
  'content/campaigns/ai-native-generation-30d/2026-08-13-notebooklm-r01-execution-pack.md',
)
assert.match(firstDue.execution.instruction, /不读取、导出或复用 Chrome Cookie/)
assert.match(firstDue.execution.recordWith, /record-campaign-research-task\.mjs --task R01/)
for (const sourceId of ['S02', 'S03', 'S04', 'S05']) {
  assert.ok(firstDue.execution.recordWith.includes(`--verified-source ${sourceId}`))
}
assert.match(firstDue.execution.recordWith, /--source-citations-verified --privacy-verified --apply/)

const safetyDue = run('2026-09-01')
const safety = safetyDue.dueTasks.find((task) => task.id === 'R04')
assert.equal(safety.mustReverifyOnline, true)
for (const sourceId of ['S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12']) {
  assert.ok(safety.sourceIds.includes(sourceId))
}

console.log('campaign research queue tests passed')

function run(asOf) {
  return JSON.parse(execFileSync(process.execPath, [script, '--as-of', asOf, '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

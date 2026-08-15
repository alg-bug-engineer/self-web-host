import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'audit-campaign-research-media-chain.mjs')
const report = JSON.parse(execFileSync(process.execPath, [script, '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))

assert.equal(report.state, 'ready')
assert.equal(report.notebooklm.validSources, 7)
assert.equal(report.notebooklm.attemptedSources, 10)
assert.equal(report.notebooklm.failedSources, 3)
assert.equal(report.notebooklm.savedResearchNotes, 5)
assert.equal(report.notebooklm.cliAuth, 'pending')
assert.equal(report.notebooklm.profile, 'ai-native-generation')
assert.equal(report.notebooklm.cliVersion, '0.8.0')
assert.equal(report.notebooklm.researchQueueTasks, 6)
assert.equal(report.notebooklm.completedResearchTasks, 1)
assert.equal(report.notebooklm.nextResearchTask, 'R01')
assert.equal(report.jimeng.executionMode, 'local_api_5100')
assert.equal(report.jimeng.lessonPosters, 12)
assert.equal(report.jimeng.selectedSourceAssets, 14)
assert.equal(report.jimeng.platformVariants, 2)
assert.ok(report.jimeng.disclosureChecks.length >= 4)
assert.ok(report.jimeng.disclosureChecks.every((item) => item.declaresGenerated && item.disclaimsOutcome))
assert.deepEqual(report.missingAssets, [])
assert.deepEqual(report.invalid, [])

console.log('campaign research/media chain tests passed')

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const report = JSON.parse(execFileSync(process.execPath, [
  path.join(projectDir, 'scripts', 'audit-campaign-calendar-matrix.mjs'),
  '--json',
], { cwd: projectDir, encoding: 'utf8' }))

assert.equal(report.campaignId, 'ai-native-generation-30d')
assert.deepEqual(report.period, { startsOn: '2026-08-12', endsOn: '2026-09-10' })
assert.equal(report.state, 'ready_with_external_gates')
assert.equal(report.calendars, 5)
assert.equal(report.entries, 100)
assert.equal(report.structuralIssues, 0)
assert.equal(report.missingAssets, 0)
assert.equal(report.invalidEntries, 0)
assert.equal(report.heldTrackingLinks, 0)
assert.equal(report.platformTotals.zsxq.planned, 30)
assert.equal(report.platformTotals.x.planned, 22)
assert.equal(report.platformTotals.video.planned, 12)
assert.equal(report.externalGates.length, 5)
assert.ok(report.externalGates.every((item) => item.platform === 'website'))

console.log('campaign calendar matrix tests passed')

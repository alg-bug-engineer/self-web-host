import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'audit-campaign-deployment.mjs')
const report = JSON.parse(execFileSync(process.execPath, [script, '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))

assert.equal(report.campaignId, 'ai-native-generation-30d')
assert.equal(report.deploymentMode, 'preflight_only')
assert.equal(report.deploymentAuthorized, false)
assert.equal(report.state, 'blocked')
assert.equal(report.localBuildHasRoute, true)
assert.equal(report.trackingStatus, 'hold_until_course_page_public')
assert.equal(
  report.latestReadinessReport,
  'ops/campaigns/ai-native-generation-30d-deployment-readiness-2026-08-12.md',
)
assert.equal(report.lastPreflight.productionStatus, 404)
assert.equal(report.assets.required, 37)
assert.equal(report.assets.existing, report.assets.required)
assert.equal(report.assets.ignoredRequired, 0)
assert.equal(report.assets.oversized, 0)
assert.ok(report.assets.totalMiB < 250)
assert.equal(report.code.runtime.required, 16)
assert.equal(report.code.runtime.existing, 16)
assert.equal(report.code.runtime.tracked, 16)
assert.equal(report.code.runtime.ignored, 0)
assert.equal(report.code.verification.required, 6)
assert.equal(report.code.verification.existing, 6)
assert.equal(report.code.verification.tracked, 6)
assert.equal(report.code.verification.ignored, 0)
assert.equal(report.localArchives.requiredForProduction, false)
assert.equal(report.localArchives.required, 12)
assert.equal(report.localArchives.existing, 12)
assert.ok(report.scope.neverInclude.includes('docs/著作.jpeg'))
assert.deepEqual(report.code.runtime.untracked, [])
assert.deepEqual(report.code.verification.untracked, [])
assert.ok(report.blockers.some((item) => item.includes('尚未获得明确授权')))

console.log('campaign deployment audit tests passed')

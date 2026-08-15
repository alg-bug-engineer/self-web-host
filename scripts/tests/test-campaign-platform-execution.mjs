import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'audit-campaign-platform-execution.mjs')
const report = JSON.parse(execFileSync(process.execPath, [script, '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
}))

assert.equal(report.state, 'ready')
assert.equal(report.platforms.length, 8)
assert.deepEqual(report.invalid, [])
assert.equal(platform('website').externalWriteStatus, 'blocked_pending_deployment_authorization')
assert.equal(platform('wechat').executionMode, 'official_api_draft_then_manual_preview')
assert.equal(platform('csdn').executionMode, 'browser_visible_ui')
assert.equal(platform('x').executionMode, 'browser_visible_ui')
assert.equal(platform('toutiao').executionMode, 'browser_visible_ui')
assert.equal(platform('zsxq').executionMode, 'browser_visible_ui')
assert.equal(platform('zsxq').pinPolicy.defaultAction, 'skip_existing_pinned_topic')
assert.equal(platform('zsxq').publicProfileReview.status, 'legacy_persona_claims_visible_pending_owner_review')
assert.equal(
  platform('zsxq').publicProfileReview.proposalAsset,
  'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-profile-proposal.md',
)
assert.equal(platform('notebooklm').externalWriteStatus, 'research_notes_only')
assert.equal(platform('jimeng').executionMode, 'local_api_5100')

console.log('campaign platform execution tests passed')

function platform(id) {
  return report.platforms.find((item) => item.id === id)
}

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectDir = process.cwd()
const filename = path.join(
  projectDir,
  'ops/campaigns/ai-native-generation-30d-cross-platform-baseline-2026-08-12.json',
)
const baseline = JSON.parse(await fs.readFile(filename, 'utf8'))

assert.equal(baseline.version, 1)
assert.equal(baseline.campaignId, 'ai-native-generation-30d')
assert.equal(baseline.phase, 'pre_09_launch_baseline')
assert.ok(baseline.capturedAt < '2026-08-12T09:00:00+08:00')
assert.equal(baseline.countingPolicy.countsAsCampaignConversion, false)
assert.match(baseline.countingPolicy.unknownMetric, /null/)
assert.equal(baseline.privacy.containsMemberIdentity, false)
assert.equal(baseline.privacy.containsChildData, false)
assert.equal(baseline.privacy.credentialsAccessed, false)

assert.equal(baseline.platforms.zsxq.items.length, 2)
assert.deepEqual(baseline.platforms.zsxq.items.map((item) => item.reads), [1, 1])
assert.ok(baseline.platforms.zsxq.items.every((item) => item.comments === null && item.likes === null))

assert.equal(baseline.platforms.x.views, 1)
assert.deepEqual(
  [baseline.platforms.x.replies, baseline.platforms.x.reposts, baseline.platforms.x.likes, baseline.platforms.x.bookmarks],
  [0, 0, 0, 0],
)
assert.match(baseline.platforms.x.url, /^https:\/\/x\.com\/.+\/status\//)

assert.equal(baseline.platforms.toutiao.likes, 0)
assert.equal(baseline.platforms.toutiao.comments, 0)
assert.equal(baseline.platforms.toutiao.reads, 0)
assert.equal(baseline.platforms.toutiao.impressions, 8)
assert.equal(baseline.platforms.toutiao.syntheticContentDisclosureVisible, true)
assert.equal(baseline.platforms.toutiao.evidence, 'authenticated_creator_center_work_management')

assert.equal(baseline.platforms.csdn.publicStatusVisible, true)
assert.deepEqual(
  [baseline.platforms.csdn.reads, baseline.platforms.csdn.likes, baseline.platforms.csdn.comments, baseline.platforms.csdn.favorites],
  [73, 2, 0, 4],
)
assert.equal(baseline.platforms.csdn.evidence, 'authenticated_creator_center_content_management')
assert.deepEqual(baseline.scheduledPreflight.map((item) => [item.platform, item.status]), [
  ['csdn', 'scheduled_visible'],
  ['toutiao', 'scheduled_visible'],
])
assert.equal(baseline.scheduledPreflight[0].creatorContentId, '163672964')
assert.equal(baseline.scheduledPreflight[1].creatorContentId, '7672708790810165812')
assert.ok(baseline.scheduledPreflight.every((item) => item.scheduledFor > baseline.capturedAt))
assert.equal(baseline.nextComparison.at, '2026-08-12T20:00:00+08:00')

console.log('campaign cross-platform baseline tests passed')

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const projectDir = process.cwd()
const config = readJson('ops/campaigns/ai-native-generation-30d-guardian-intake.json')
const expectedCodes = {
  '儿童AI内测-星球': 'zsxq',
  '儿童AI内测-公众号': 'wechat',
  '儿童AI内测-X': 'x',
  '儿童AI内测-CSDN': 'csdn',
  '儿童AI内测-头条': 'toutiao',
  '儿童AI内测-网站': 'website',
  '儿童AI内测': 'unattributed',
}
assert.deepEqual(config.referralCodes, expectedCodes)
assert.equal(config.storageMode, 'aggregate_only')
assert.ok(config.rules.some((item) => item.includes('无法确认来源时记 unattributed') && item.includes('不猜测')))

const platformAssets = [
  ['content/campaigns/ai-native-generation-30d/2026-08-18-wechat-family-ai-boundaries.md', '儿童AI内测-公众号'],
  ['content/campaigns/ai-native-generation-30d/2026-08-24-zsxq-challenge-day3.md', '儿童AI内测-星球'],
  ['content/campaigns/ai-native-generation-30d/2026-08-31-course-beta-recruitment-publish.txt', '儿童AI内测-星球'],
  ['content/campaigns/ai-native-generation-30d/2026-08-31-course-beta-recruitment.md', '儿童AI内测-网站'],
  ['content/campaigns/ai-native-generation-30d/2026-08-31-wechat-course-beta-intake.md', '儿童AI内测-公众号'],
  ['content/campaigns/ai-native-generation-30d/2026-08-31-x-course-beta-publish.txt', '儿童AI内测-X'],
  ['content/campaigns/ai-native-generation-30d/2026-08-31-x-course-beta.md', '儿童AI内测-X'],
  ['content/campaigns/ai-native-generation-30d/2026-09-01-zsxq-project-workshop.md', '儿童AI内测-星球'],
  ['content/campaigns/ai-native-generation-30d/2026-09-02-csdn-double-gate-safety.md', '儿童AI内测-CSDN'],
  ['content/campaigns/ai-native-generation-30d/2026-09-06-toutiao-four-minute-defense.md', '儿童AI内测-头条'],
  ['content/campaigns/ai-native-generation-30d/2026-09-09-wechat-trial-review.md', '儿童AI内测-公众号'],
]
for (const [asset, code] of platformAssets) {
  const text = readText(asset)
  assert.ok(text.includes(code), `${asset} 缺少来源码 ${code}`)
  assert.equal(expectedCodes[code], expectedOrigin(asset), `${asset} 来源码与平台不一致`)
}

const bridge = readText('content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-course-intake-bridge.md')
assert.ok(bridge.includes('不是公开主帖，也不是首评'))
assert.ok(bridge.includes('只有监护人') && bridge.includes('主动询问'))
assert.ok(bridge.includes('不在知识星球公开评论中收集年龄段或家庭情况'))
assert.ok(bridge.includes('不自动读取公众号私信'))
assert.ok(bridge.includes('未带来源码或无法确认来源时记 `unattributed`'))
assert.ok(bridge.includes('关键词本身不计有效意向'))

const august12Manifest = JSON.parse(execFileSync(process.execPath, [
  path.join(projectDir, 'scripts/verify-campaign-publish-manifest.mjs'), '--json',
], { cwd: projectDir, encoding: 'utf8' }))
assert.equal(august12Manifest.state, 'ready')
for (const asset of ['2026-08-12-zsxq-start-here-publish.txt', '2026-08-12-x-post-publish.txt', '2026-08-12-x-post-video-publish.txt']) {
  assert.doesNotMatch(readText(`content/campaigns/ai-native-generation-30d/${asset}`), /儿童AI内测-/)
}

const august13Operator = JSON.parse(execFileSync(process.execPath, [
  path.join(projectDir, 'scripts/generate-campaign-operator-pack.mjs'),
  '--date', '2026-08-13', '--slot', '09', '--json',
], { cwd: projectDir, encoding: 'utf8' }))
const l01Action = august13Operator.runSlot.allowedActions.find((item) => item.calendarEntryId === 'w1-zsxq-01')
assert.equal(l01Action.publishAsset, 'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-l01-activation-publish.txt')
assert.notEqual(l01Action.publishAsset, 'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-course-intake-bridge.md')
assert.match(august13Operator.guardianIntake.recordCommandTemplate, /--origin-zsxq <COUNT>/)
assert.match(august13Operator.guardianIntake.recordCommandTemplate, /--origin-unattributed <COUNT>/)

console.log('campaign referral attribution tests passed')

function readJson(file) {
  return JSON.parse(readText(file))
}

function readText(file) {
  return fs.readFileSync(path.join(projectDir, file), 'utf8')
}

function expectedOrigin(asset) {
  if (asset.includes('-zsxq-') || asset.includes('recruitment-publish')) return 'zsxq'
  if (asset.includes('-wechat-')) return 'wechat'
  if (asset.includes('-x-')) return 'x'
  if (asset.includes('-csdn-')) return 'csdn'
  if (asset.includes('-toutiao-')) return 'toutiao'
  if (asset.endsWith('course-beta-recruitment.md')) return 'website'
  throw new Error(`无法判断平台：${asset}`)
}

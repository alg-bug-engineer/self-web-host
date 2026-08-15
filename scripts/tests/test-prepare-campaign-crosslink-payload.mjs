import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'prepare-campaign-crosslink-payload.mjs')
const topicUrl = 'https://wx.zsxq.com/topic_detail/885588221144'
const topicShareShortlink = 'https://t.zsxq.com/1uK2r'

const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
assert.match(help, /只读/)
assert.match(help, /不写文件/)
assert.match(help, /t\.zsxq\.com/)

for (const input of [
  'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-publish.txt',
  'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-video-publish.txt',
]) {
  const result = run(['--input', input, '--destination-url', topicUrl, '--json'])
  assert.equal(result.mode, 'read_only_runtime_payload')
  assert.equal(result.destinationType, 'verified_topic_detail')
  assert.equal(result.destination, topicUrl)
  assert.equal(result.writesPerformed, false)
  assert.match(result.sourceSha256, /^[a-f0-9]{64}$/)
  assert.match(result.contentSha256, /^[a-f0-9]{64}$/)
  assert.notEqual(result.sourceSha256, result.contentSha256)
  assert.ok(result.weightedLength <= 280)
  assert.match(result.payload, new RegExp(topicUrl))
  assert.doesNotMatch(result.payload, /https:\/\/wx\.zsxq\.com\/group\/88888881284242/)
}

const fallback = run([
  '--input', 'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-publish.txt',
  '--destination-url', 'https://wx.zsxq.com/group/88888881284242',
  '--json',
])
assert.equal(fallback.destinationType, 'group_fallback')

const topicShare = run([
  '--input', 'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-publish.txt',
  '--destination-url', topicShareShortlink,
  '--json',
])
assert.equal(topicShare.destinationType, 'verified_topic_share_shortlink')
assert.equal(topicShare.destination, topicShareShortlink)
assert.match(topicShare.payload, new RegExp(topicShareShortlink))
assert.ok(topicShare.weightedLength <= 280)

for (const invalidUrl of [
  'http://wx.zsxq.com/topic_detail/1',
  'https://example.com/topic_detail/1',
  'https://wx.zsxq.com/unknown/1',
  'https://wx.zsxq.com/topic_detail/1?token=secret',
  'https://t.zsxq.com/',
  'https://t.zsxq.com/1uK2r?token=secret',
  'https://evil.example/1uK2r',
]) {
  const rejected = spawnSync(process.execPath, [
    script,
    '--input', 'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-publish.txt',
    '--destination-url', invalidUrl,
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(rejected.status, 1)
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-crosslink-'))
try {
  const outside = path.join(tempDir, 'outside-publish.txt')
  fs.writeFileSync(outside, 'https://wx.zsxq.com/group/1\n')
  const rejected = spawnSync(process.execPath, [
    script,
    '--input', outside,
    '--destination-url', topicUrl,
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /活动内容目录/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign crosslink payload tests passed')

function run(values) {
  return JSON.parse(execFileSync(process.execPath, [script, ...values], {
    cwd: projectDir,
    encoding: 'utf8',
  }))
}

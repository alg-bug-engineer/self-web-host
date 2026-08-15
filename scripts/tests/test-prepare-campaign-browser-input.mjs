import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'prepare-campaign-browser-input.mjs')
const run = (args) => JSON.parse(execFileSync(process.execPath, [script, ...args], { cwd: projectDir, encoding: 'utf8' }))

const help = execFileSync(process.execPath, [script, '--help'], { cwd: projectDir, encoding: 'utf8' })
assert.match(help, /只拆分已锁定 -publish\.txt/)
assert.match(help, /不从母稿重新生成/)

const zsxq = run(['--calendar-entry', 'w1-zsxq-start', '--json'])
assert.equal(zsxq.platform, 'zsxq')
assert.equal(zsxq.variant, 'default')
assert.equal(zsxq.editorFields.title, '从这里开始｜10 分钟完成第一步，不需要补历史内容')
assert.match(zsxq.editorFields.body, /^“芝士AI吃鱼”正在试运行四周主题/)
assert.match(zsxq.editorFields.body, /今天不要补完 128 条历史主题/)
assert.doesNotMatch(zsxq.editorFields.body, /^从这里开始｜/)
assert.equal(zsxq.contentSha256, '86f5f533145f854ce9e5bd667d7596b3e63ef73bbf8826d9d31932f4bd1fe7f0')
assert.equal(zsxq.writesPerformed, false)

const xFallback = run(['--calendar-entry', 'w1-x-01', '--json'])
assert.equal(xFallback.asset, 'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-publish.txt')
assert.equal(xFallback.contentSha256, '6c3002901d83c27478460ba142e2f058312bac9630e25b0003f339f6f6e4f49e')
assert.match(xFallback.editorFields.text, /^儿童 AI 素养不是提示词熟练度。/)
assert.equal(xFallback.editorFields.altText, undefined)
assert.ok(xFallback.weightedLength <= 280)

const xMedia = run(['--calendar-entry', 'w1-x-01', '--variant', 'media', '--json'])
assert.equal(xMedia.asset, 'content/campaigns/ai-native-generation-30d/2026-08-12-x-post-video-publish.txt')
assert.equal(xMedia.contentSha256, '67bd1660e86dc9d334d7e65ca7c487b36abb7e2c14cc465a44184a4c804065d0')
assert.match(xMedia.editorFields.altText, /今天谁替你做了预测/)
assert.match(xMedia.editorFields.altText, /先理解，再使用；先核验，再相信/)
assert.equal(xMedia.altTextSha256, 'ff289ea6a4fe3a3ba1ba0cf08ab51748d8937e22a1d6aad6b0a7eef10bec94d6')

const l01Media = run([
  '--calendar-entry', 'w1-zsxq-01',
  '--variant', 'media',
  '--asset', 'content/campaigns/ai-native-generation-30d/2026-08-13-zsxq-l01-activation-video-publish.txt',
  '--json',
])
assert.equal(l01Media.editorFields.title, 'L01｜先不学提示词：找出今天替你做预测的 3 个 AI')
assert.equal(l01Media.contentSha256, 'de1d1ad3597c04f7488f97b50bf5824446dd289f8960eeb2c2533b6c8f474183')

const topic = 'https://t.zsxq.com/1uK2r'
const xCrosslink = run([
  '--calendar-entry', 'w1-x-01',
  '--variant', 'media',
  '--crosslink-destination', topic,
  '--json',
])
assert.equal(xCrosslink.crosslinkDestination, topic)
assert.match(xCrosslink.editorFields.text, /https:\/\/t\.zsxq\.com\/1uK2r/)
assert.equal(xCrosslink.editorFields.altText, xMedia.editorFields.altText)
assert.doesNotMatch(xCrosslink.editorFields.text, /wx\.zsxq\.com\/group/)
assert.notEqual(xCrosslink.sourceSha256, xCrosslink.contentSha256)

for (const args of [
  ['--calendar-entry', 'w1-zsxq-start', '--variant', 'media'],
  ['--calendar-entry', 'w1-zsxq-start', '--crosslink-destination', topic],
  ['--calendar-entry', 'w1-x-01', '--crosslink-destination', 'https://example.com/topic'],
]) {
  const rejected = spawnSync(process.execPath, [script, ...args], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(rejected.status, 1)
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-browser-input-'))
try {
  const tamperedCalendar = path.join(tempDir, 'tampered-calendar.json')
  const week1 = JSON.parse(fs.readFileSync(
    path.join(projectDir, 'ops/campaigns/ai-native-generation-30d-week1-content-calendar.json'),
    'utf8',
  ))
  week1.entries.find((item) => item.id === 'w1-x-01').mediaAttachment.altText += '临时改写'
  fs.writeFileSync(tamperedCalendar, JSON.stringify(week1))
  const tamperedAlt = spawnSync(process.execPath, [script,
    '--calendar', tamperedCalendar,
    '--calendar-entry', 'w1-x-01',
    '--variant', 'media',
  ], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(tamperedAlt.status, 1)
  assert.match(tamperedAlt.stderr, /替代文本与周历摘要不一致/)

  const outside = path.join(tempDir, '2026-08-12-outside-publish.txt')
  fs.writeFileSync(outside, '外部文件\n')
  const calendar = path.join(tempDir, 'calendar.json')
  fs.writeFileSync(calendar, JSON.stringify({
    campaignId: 'ai-native-generation-30d',
    entries: [{ id: 'outside', platform: 'x', title: '外部', assets: [outside] }],
  }))
  const rejected = spawnSync(process.execPath, [script, '--calendar', calendar, '--calendar-entry', 'outside'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /本活动目录/)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('campaign browser input tests passed')

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const projectDir = process.cwd()
const script = path.join(projectDir, 'scripts', 'generate-campaign-brief.mjs')

const json = execFileSync(process.execPath, [script, '--date', '2026-08-12', '--json'], {
  cwd: projectDir,
  encoding: 'utf8',
})
const brief = JSON.parse(json)
assert.equal(brief.campaignId, 'ai-native-generation-30d')
assert.equal(brief.week, 1)
assert.equal(brief.primaryChannel, 'zsxq')
assert.match(brief.cta, /场景.*输入.*输出.*错误.*检查者/)
assert.match(brief.articleTopic, /AI 素养/)
assert.equal(brief.weekLessons.length, 3)
assert.ok(brief.guardrails.some((item) => item.includes('儿童姓名')))

const topic = execFileSync(process.execPath, [script, '--date', '2026-09-10', '--field', 'articleTopic'], {
  cwd: projectDir,
  encoding: 'utf8',
})
assert.match(topic, /是否值得继续/)

console.log('campaign brief tests passed')

#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const policy = JSON.parse(await fs.readFile(path.join(projectDir, 'ops', 'public-claim-policy.json'), 'utf8'))

assert.equal(policy.version, 1)
assert.ok(policy.routes.includes('/about'))
assert.ok(policy.routes.includes('/planet'))
assert.ok(policy.routes.includes('/collections/tools'))
assert.ok(policy.disallowedClaims.length >= 7)

const sources = await Promise.all(policy.sourceFiles.map(async (filename) => ({
  filename,
  text: await fs.readFile(path.join(projectDir, filename), 'utf8'),
})))

for (const claim of policy.disallowedClaims) {
  assert.ok(claim.id && claim.fragment && claim.reason, '公开承诺策略条目必须包含 id、fragment 和 reason')
  for (const source of sources) {
    assert.ok(!source.text.includes(claim.fragment), `${source.filename} 重新引入了无来源承诺：${claim.id}`)
  }
}

const planet = sources.find((source) => source.filename === 'src/app/planet/page.tsx')?.text || ''
const about = sources.find((source) => source.filename === 'src/app/about/page.tsx')?.text || ''
const zsxqProfile = sources.find((source) => source.filename.endsWith('2026-08-12-zsxq-profile-proposal.md'))?.text || ''
const audit = await fs.readFile(path.join(projectDir, 'scripts', 'audit-production.mjs'), 'utf8')

assert.match(planet, /href="\/blog"/)
assert.match(planet, /application\/ld\+json/)
assert.match(planet, /title: `AI 实践学习社区｜儿童 AI 素养试运行/)
assert.match(planet, /当前主线是“AI 原生一代：儿童 AI 素养”家庭实践课试运行/)
assert.match(planet, /知识星球共学与课程内测分别登记/)
assert.match(planet, /name: '家庭 AI 教育'/)
assert.doesNotMatch(planet, /<button\b/)
assert.match(planet, /url\.protocol === 'https:'/)
assert.match(planet, /url\.hostname !== 'ai-knowledgepoints\.cn'/)
assert.match(planet, /当前没有配置公开加入链接/)
assert.match(about, /CSDN 内容数和公众号读者数来自既有资料/)
assert.match(zsxqProfile, /draft_only_owner_approval_required/)
assert.match(zsxqProfile, /知识星球共学与课程内测分别登记/)
assert.match(zsxqProfile, /不收集儿童姓名、学校、位置、正脸、账号、私人聊天或原始作业/)
assert.match(zsxqProfile, /账号设置不得由自动任务修改/)
assert.doesNotMatch(zsxqProfile, /百度|阿里|大厂|竞赛奖项/)
assert.doesNotMatch(about, /tech\.level|技术专长.*%/s)
assert.doesNotMatch(about, />在线</)
assert.match(audit, /public-claim-policy\.json/)
assert.match(audit, /publicClaimViolations/)

console.log(`公开承诺策略测试通过：${policy.sourceFiles.length} 个源码入口，${policy.disallowedClaims.length} 条无来源承诺保持移除。`)

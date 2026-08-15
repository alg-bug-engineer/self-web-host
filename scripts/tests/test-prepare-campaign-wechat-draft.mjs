import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const projectDir = process.cwd()
const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'campaign-wechat-'))
const script = path.join(projectDir, 'scripts', 'prepare-campaign-wechat-draft.mjs')
const manifestPath = execFileSync(process.execPath, [
  script,
  '--source', 'content/campaigns/ai-native-generation-30d/2026-08-12-wechat-article.md',
  '--date', '2026-08-14',
  '--slug', 'child-ai-three-questions',
  '--title', '孩子问 AI 一个问题，得到的真的是“答案”吗？',
  '--description', '生成式 AI 写得像答案，不等于已经查证。',
  '--cover', 'public/images/courses/ai-native-generation/L02/poster.webp',
  '--output-dir', outputDir,
], { cwd: projectDir, encoding: 'utf8' }).trim()

const manifest = JSON.parse(await fs.readFile(path.resolve(projectDir, manifestPath), 'utf8'))
const html = await fs.readFile(path.resolve(projectDir, manifest.htmlPath), 'utf8')
assert.equal(manifest.releaseGate, 'draft_only_manual_preview')
assert.deepEqual(manifest.authorApproval, {
  status: 'pending',
  approvedAt: null,
  approvedContentSha256: null,
})
assert.equal(manifest.websiteUrl, null)
assert.equal(manifest.title, '孩子问 AI 一个问题，得到的真的是“答案”吗？')
assert.ok(html.includes('<article>'))
assert.ok(html.includes('儿童AI内测'))
assert.ok(html.includes('当前只登记意向，不代表录取，也不收费'))
assert.ok(!html.includes('<h1>'))
const article = html.match(/<article>([\s\S]*?)<\/article>/i)?.[1]
assert.equal(manifest.contentSha256, crypto.createHash('sha256').update(article).digest('hex'))

console.log('campaign WeChat draft preparation tests passed')

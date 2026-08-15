import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const projectDir = process.cwd()
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-draft-verify-'))
const manifest = {
  date: '2026-08-14',
  slug: 'child-ai-three-questions',
  title: '孩子问 AI 一个问题，得到的真的是“答案”吗？',
  releaseGate: 'draft_only_manual_preview',
  authorApproval: {
    status: 'pending',
    approvedAt: null,
    approvedContentSha256: null,
  },
}
const state = {
  '2026-08-14:child-ai-three-questions': {
    status: 'draft',
    draftMediaId: 'fixture-media-id',
  },
}
const fixture = {
  news_item: [{
    title: manifest.title,
    content: `<p>${'有效正文'.repeat(1100)}</p>`,
    thumb_media_id: 'fixture-cover-id',
  }],
}
const manifestFile = path.join(directory, 'manifest.json')
const stateFile = path.join(directory, 'state.json')
const fixtureFile = path.join(directory, 'fixture.json')
await Promise.all([
  fs.writeFile(manifestFile, `${JSON.stringify(manifest)}\n`),
  fs.writeFile(stateFile, `${JSON.stringify(state)}\n`),
  fs.writeFile(fixtureFile, `${JSON.stringify(fixture)}\n`),
])

const report = JSON.parse(execFileSync(process.execPath, [
  path.join(projectDir, 'scripts', 'verify-wechat-draft.mjs'), manifestFile,
], {
  cwd: projectDir,
  encoding: 'utf8',
  env: {
    ...process.env,
    WECHAT_PUBLISH_STATE_FILE: stateFile,
    WECHAT_DRAFT_VERIFY_FIXTURE: fixtureFile,
  },
}))

assert.equal(report.state, 'verified_draft')
assert.equal(report.status, 'draft')
assert.equal(report.title, manifest.title)
assert.equal(report.articleCount, 1)
assert.equal(report.hasCover, true)
assert.equal(report.requiresAuthorPreview, true)
assert.equal(report.approvedForPublish, false)
assert.equal(report.publishedUrl, null)
assert.deepEqual(report.invalid, [])

console.log('WeChat draft verification tests passed')

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execFileSync, spawnSync } from 'node:child_process'

const projectDir = process.cwd()
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-author-approval-'))
const htmlFile = path.join(directory, 'article.html')
const manifestFile = path.join(directory, 'manifest.json')
const article = `<p>${'待确认正文'.repeat(900)}</p>`
const contentSha256 = crypto.createHash('sha256').update(article).digest('hex')
await fs.writeFile(htmlFile, `<article>${article}</article>`)
await fs.writeFile(manifestFile, `${JSON.stringify({
  title: '待确认公众号稿',
  htmlPath: htmlFile,
  contentSha256,
  releaseGate: 'draft_only_manual_preview',
  authorApproval: { status: 'pending', approvedAt: null, approvedContentSha256: null },
}, null, 2)}\n`)

try {
  const common = [
    path.join(projectDir, 'scripts/record-wechat-author-approval.mjs'),
    '--manifest', manifestFile,
    '--approved-at', '2026-08-14T19:30:00+08:00',
  ]
  const before = await fs.readFile(manifestFile, 'utf8')
  const dryRun = JSON.parse(execFileSync(process.execPath, common, { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(dryRun.mode, 'dry_run')
  assert.equal(dryRun.writesPerformed, false)
  assert.equal(dryRun.externalPublishPerformed, false)
  assert.equal(await fs.readFile(manifestFile, 'utf8'), before)

  const applied = JSON.parse(execFileSync(process.execPath, [...common, '--apply'], { cwd: projectDir, encoding: 'utf8' }))
  assert.equal(applied.writesPerformed, true)
  const stored = JSON.parse(await fs.readFile(manifestFile, 'utf8'))
  assert.equal(stored.releaseGate, 'author_approved_for_publish')
  assert.equal(stored.authorApproval.status, 'approved')
  assert.equal(stored.authorApproval.approvedContentSha256, contentSha256)

  const repeat = spawnSync(process.execPath, [...common, '--apply'], { cwd: projectDir, encoding: 'utf8' })
  assert.equal(repeat.status, 1)
  assert.match(repeat.stderr, /只允许确认 draft_only_manual_preview 草稿/)
} finally {
  await fs.rm(directory, { recursive: true, force: true })
}

console.log('WeChat author approval recorder tests passed')

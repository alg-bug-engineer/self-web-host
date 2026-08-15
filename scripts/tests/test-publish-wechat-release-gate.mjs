import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const projectDir = process.cwd()
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-release-gate-'))
const htmlFile = path.join(directory, 'article.html')
const coverFile = path.join(directory, 'cover.png')
const stateFile = path.join(directory, 'state.json')
const article = `<p>${'公众号正文'.repeat(1200)}</p>`
const contentSha256 = crypto.createHash('sha256').update(article).digest('hex')
await Promise.all([
  fs.writeFile(htmlFile, `<!doctype html><article>${article}</article>`),
  fs.writeFile(coverFile, 'fixture'),
  fs.writeFile(stateFile, '{}\n'),
])

try {
  const pendingManifest = await writeManifest('pending.json', {
    releaseGate: 'draft_only_manual_preview',
    authorApproval: { status: 'pending', approvedAt: null, approvedContentSha256: null },
  })
  const pending = run(pendingManifest, { WECHAT_AUTO_PUBLISH: 'true' })
  assert.equal(pending.status, 1)
  assert.match(pending.stderr, /作者尚未完成移动端预览并明确确认/)

  const wrongHashManifest = await writeManifest('wrong-hash.json', {
    releaseGate: 'author_approved_for_publish',
    authorApproval: {
      status: 'approved',
      approvedAt: '2026-08-14T19:30:00+08:00',
      approvedContentSha256: '0'.repeat(64),
    },
  })
  const wrongHash = run(wrongHashManifest, { WECHAT_AUTO_PUBLISH: 'true' })
  assert.equal(wrongHash.status, 1)
  assert.match(wrongHash.stderr, /作者确认的正文版本与当前正文不一致/)

  const approvedManifest = await writeManifest('approved.json', {
    releaseGate: 'author_approved_for_publish',
    authorApproval: {
      status: 'approved',
      approvedAt: '2026-08-14T19:30:00+08:00',
      approvedContentSha256: contentSha256,
    },
  })
  const approvedDryRun = run(approvedManifest, { WECHAT_AUTO_PUBLISH: 'true' })
  assert.equal(approvedDryRun.status, 0)
  assert.match(approvedDryRun.stdout, /公众号发布预检通过/)

  const legacyManifest = path.join(directory, 'legacy.json')
  await fs.writeFile(legacyManifest, `${JSON.stringify({
    date: '2026-08-10',
    slug: 'legacy-daily',
    title: '既有日更稿',
    description: '既有流程兼容性测试',
    htmlPath: htmlFile,
    coverPath: coverFile,
    websiteUrl: null,
  }, null, 2)}\n`)
  const legacyDryRun = run(legacyManifest, { WECHAT_AUTO_PUBLISH: 'true' })
  assert.equal(legacyDryRun.status, 0)
  assert.match(legacyDryRun.stdout, /公众号发布预检通过/)

  const changedHtml = `${article}<p>未重新确认的修改</p>`
  await fs.writeFile(htmlFile, `<!doctype html><article>${changedHtml}</article>`)
  const changed = run(approvedManifest, { WECHAT_AUTO_PUBLISH: 'true' })
  assert.equal(changed.status, 1)
  assert.match(changed.stderr, /公众号正文哈希与清单不一致/)
} finally {
  await fs.rm(directory, { recursive: true, force: true })
}

console.log('WeChat publish release gate tests passed')

async function writeManifest(name, overrides) {
  const file = path.join(directory, name)
  const manifest = {
    date: '2026-08-14',
    slug: 'child-ai-three-questions',
    title: '测试稿',
    description: '测试摘要',
    htmlPath: htmlFile,
    coverPath: coverFile,
    websiteUrl: null,
    contentSha256,
    ...overrides,
  }
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`)
  return file
}

function run(manifestFile, overrides = {}) {
  return spawnSync(process.execPath, [path.join(projectDir, 'scripts/publish-wechat.mjs'), manifestFile], {
    cwd: projectDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      WECHAT_DRY_RUN: 'true',
      WECHAT_PUBLISH_STATE_FILE: stateFile,
      ...overrides,
    },
  })
}

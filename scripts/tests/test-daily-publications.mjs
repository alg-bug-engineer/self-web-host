#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { publicationDate, summarizePublications, readPublishedDay } from '../check-daily-publications.mjs'

const day = '2026-10-02'
const entry = (name, extra = '', date = day) => ({ path: `content/posts/${name}.mdx`, raw: `---\ntitle: sample\ndate: ${date}\n${extra}\n---\nBody\npublished: true\n` })
const rag = 'topicCluster: rag-engineering\ntopicId: rag-evaluation-02'
const check = (entries) => summarizePublications(entries, day)
assert.equal(publicationDate('2026-10-01T16:00:00Z'), day)
assert.equal(publicationDate('2026-10-02T15:59:59Z'), day)
assert.equal(publicationDate('2026-10-02T16:00:00Z'), '2026-10-03')
assert.equal(publicationDate('2026-10-01T23:30:00-01:00'), day)
assert.throws(() => publicationDate('2026-10-02T08:30:00'), /时区/)
assert.throws(() => publicationDate('2026-02-30'), /无效日期/)
assert.equal(check([entry('rag-evaluation-02-chunking-evidence-mapping', rag)]).technicalSeries.length, 1)
assert.equal(check([entry('rag', `postType: article\n${rag}`)]).technicalSeries.length, 1)
assert.equal(check([entry('draft', `published: false # retained draft\n${rag}`)]).articles.length, 0)
assert.equal(check([entry('daily-2026-10-02-old', rag, '2026-10-01')]).technicalSeries.length, 0)
assert.equal(check([entry('utc', rag, '2026-10-01T16:00:00Z')]).technicalSeries.length, 1)
assert.equal(check([entry('quoted', `published: true # public\ntopicCluster: 'rag-engineering'\ntopicId: "rag-evaluation-02"`, '"2026-10-02" # date')]).technicalSeries.length, 1)
for (const extra of ['topicCluster: engineering\ntopicId: engineering-human-override', 'topicCluster: rag-engineering', 'topicId: rag-evaluation-02', `${rag}\ncategory: life`]) {
  const status = check([entry('ordinary', extra)])
  assert.equal(status.technicalSeries.length, 0)
  assert.equal(status.legacyArticleNeeded, false)
}
const commentary = check([entry('commentary', `postType: commentary\n${rag}`)])
assert.equal(commentary.commentary.length, 1)
assert.equal(commentary.technicalSeries.length, 0)
assert.equal(commentary.legacyArticleNeeded, true)
const both = check([entry('series', rag), entry('commentary', 'postType: commentary')])
assert.equal(both.commentary.length, 1)
assert.equal(both.technicalSeries.length, 1)
assert.equal(both.legacyArticleNeeded, false)
assert.equal(check([entry('draft-commentary', 'postType: commentary\npublished: false')]).commentary.length, 0)
for (const extra of ['published: "false"', 'published: false\npublished: true', 'postType: unknown', 'topicCluster: [rag-engineering]', 'date: 2026-10-03']) {
  assert.throws(() => check([entry('invalid', extra)]))
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-publications-'))
try {
  const git = (...args) => execFileSync('git', args, { cwd: temp, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test')
  fs.mkdirSync(path.join(temp, 'content/posts'), { recursive: true })
  const remotePost = entry('nested/series', rag)
  fs.mkdirSync(path.dirname(path.join(temp, remotePost.path)), { recursive: true })
  fs.writeFileSync(path.join(temp, remotePost.path), remotePost.raw)
  git('add', '.'); git('commit', '-m', 'remote snapshot'); git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  fs.writeFileSync(path.join(temp, remotePost.path), entry('draft', `published: false\n${rag}`).raw)
  fs.writeFileSync(path.join(temp, 'content/posts/dirty-commentary.mdx'), entry('dirty-commentary', 'postType: commentary').raw)
  const status = readPublishedDay({ cwd: temp, date: day })
  assert.deepEqual(status.technicalSeries, [remotePost.path])
  assert.equal(status.commentary.length, 0)
  // Even committed local branch content does not count until origin/main contains it.
  git('add', '.'); git('commit', '-m', 'local only')
  assert.deepEqual(readPublishedDay({ cwd: temp, date: day }), status)
} finally { fs.rmSync(temp, { recursive: true, force: true }) }
console.log('双线发布检测测试通过：上海日期、系列 slug、草稿、旧元数据、普通长文、锐评、远端快照及脏工作区隔离。')

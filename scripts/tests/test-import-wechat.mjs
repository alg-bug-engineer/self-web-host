#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const projectDir = path.resolve(import.meta.dirname, '../..')
const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-import-test-'))
const postsDir = path.join(temporaryDir, 'posts')
const fixture = path.join(projectDir, 'scripts/tests/fixtures/wechat-feed.xml')

const runImport = () => spawnSync(process.execPath, ['scripts/import-wechat.mjs'], {
  cwd: projectDir,
  encoding: 'utf8',
  env: {
    ...process.env,
    WECHAT_RSS_FILE: fixture,
    WECHAT_POSTS_DIR: postsDir,
    WECHAT_AUTO_PUBLISH: 'true',
    WECHAT_IMPORT_DAYS: '31',
    WECHAT_MAX_IMPORTS: '12',
    WECHAT_EXPECTED_BIZ: 'MzIxMjY3NzMwNw==',
    WECHAT_NOW: '2026-08-11T00:00:00Z',
  },
})

try {
  const first = runImport()
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /新增 1 篇已发布文章/)
  const files = await fs.readdir(postsDir)
  assert.equal(files.length, 1)
  const content = await fs.readFile(path.join(postsDir, files[0]), 'utf8')
  assert.match(content, /published: true/)
  assert.match(content, /最近一篇完整公众号文章/)
  assert.match(content, /https:\/\/mp\.weixin\.qq\.com\/s\?__biz=/)
  assert.match(content, /https:\/\/mmbiz\.qpic\.cn\/test-image\.jpg/)
  assert.doesNotMatch(content, /其他公众号文章|超过时间范围的旧文章|正文过短的文章/)

  const second = runImport()
  assert.equal(second.status, 0, second.stderr)
  assert.match(second.stdout, /新增 0 篇已发布文章/)
  assert.equal((await fs.readdir(postsDir)).length, 1)
  console.log('公众号最近文章过滤、发布、图片转换与规范化去重测试通过。')
} finally {
  await fs.rm(temporaryDir, { recursive: true, force: true })
}

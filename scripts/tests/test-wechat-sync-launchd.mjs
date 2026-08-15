#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectDir = path.resolve(import.meta.dirname, '..', '..')
const testHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-sync-launchd-'))
const noOp = '/usr/bin/true'

try {
  const { stdout } = await execFileAsync('bash', ['scripts/install-wechat-sync-launchd.sh'], {
    cwd: projectDir,
    env: {
      ...process.env,
      HOME: testHome,
      PROJECT_DIR: projectDir,
      PLUTIL_BIN: noOp,
      LAUNCHCTL_BIN: noOp,
    },
  })
  const plistPath = path.join(testHome, 'Library', 'LaunchAgents', 'cn.ai-knowledgepoints.wechat-site-sync.plist')
  const plist = await fs.readFile(plistPath, 'utf8')
  const syncScript = await fs.readFile(path.join(projectDir, 'scripts', 'run-wechat-site-sync.sh'), 'utf8')

  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/)
  assert.match(plist, /<key>StartCalendarInterval<\/key><dict><key>Minute<\/key><integer>17<\/integer>/)
  assert.match(plist, /127\.0\.0\.1:8001\/feed\/MP_WXS_3212677307\.rss\?limit=50/)
  assert.match(plist, /<key>WECHAT_EXPECTED_FEED_ID<\/key><string>MP_WXS_3212677307<\/string>/)
  assert.match(plist, new RegExp(`${escapeRegExp(projectDir)}/scripts/run-wechat-site-sync\\.sh`))
  assert.match(stdout, /每小时第 17 分钟/)
  assert.match(syncScript, /status --porcelain -- content\/posts/)
  assert.doesNotMatch(syncScript, /diff --quiet -- content\/posts/)
} finally {
  await fs.rm(testHome, { recursive: true, force: true })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

console.log('公众号网站同步 launchd 配置测试通过：登录补跑、每小时第 17 分钟执行。')

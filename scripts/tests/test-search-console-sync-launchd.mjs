#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectDir = path.resolve(import.meta.dirname, '..', '..')
const testHome = await fs.mkdtemp(path.join(os.tmpdir(), 'search-console-sync-launchd-'))
const noOp = '/usr/bin/true'

try {
  const { stdout } = await execFileAsync('bash', ['scripts/install-search-console-sync-launchd.sh'], {
    cwd: projectDir,
    env: {
      ...process.env,
      HOME: testHome,
      PROJECT_DIR: projectDir,
      PLUTIL_BIN: noOp,
      LAUNCHCTL_BIN: noOp,
    },
  })
  const plistPath = path.join(testHome, 'Library', 'LaunchAgents', 'cn.ai-knowledgepoints.search-console-sync.plist')
  const plist = await fs.readFile(plistPath, 'utf8')
  const syncEnv = path.join(testHome, '.config', 'ai-knowledgepoints', 'search-console-sync.env')

  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/)
  assert.match(plist, /<integer>9<\/integer><key>Minute<\/key><integer>20<\/integer>/)
  assert.match(plist, new RegExp(`${escapeRegExp(projectDir)}/scripts/run-search-console-sync\\.sh`))
  assert.match(plist, /SEARCH_CONSOLE_SYNC_ENV_FILE/)
  assert.equal((await fs.stat(syncEnv)).mode & 0o777, 0o600)
  assert.match(stdout, /每日 09:20 与登录后补跑/)
} finally {
  await fs.rm(testHome, { recursive: true, force: true })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

console.log('Search Console 本机 launchd 配置测试通过：登录补跑、日常同步与私有配置权限已固化。')

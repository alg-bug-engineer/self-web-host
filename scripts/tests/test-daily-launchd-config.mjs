#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectDir = path.resolve(import.meta.dirname, '..', '..')
const testHome = await fs.mkdtemp(path.join(os.tmpdir(), 'daily-launchd-config-'))
const noOp = '/usr/bin/true'

try {
  const { stdout } = await execFileAsync('bash', ['scripts/install-daily-content-launchd.sh'], {
    cwd: projectDir,
    env: {
      ...process.env,
      HOME: testHome,
      PROJECT_DIR: projectDir,
      PLUTIL_BIN: noOp,
      LAUNCHCTL_BIN: noOp,
    },
  })
  const plistPath = path.join(testHome, 'Library', 'LaunchAgents', 'cn.ai-knowledgepoints.daily-content.plist')
  const plist = await fs.readFile(plistPath, 'utf8')
  const publisherEnv = path.join(testHome, '.config', 'ai-knowledgepoints', 'publisher.env')

  assert.match(plist, /<key>RunAtLoad<\/key><true\/>/)
  assert.match(plist, /<key>StartCalendarInterval<\/key><array>/)
  assert.equal((plist.match(/<key>Hour<\/key>/g) || []).length, 3)
  assert.match(plist, /<integer>8<\/integer><key>Minute<\/key><integer>30<\/integer>/)
  assert.match(plist, /<integer>10<\/integer><key>Minute<\/key><integer>30<\/integer>/)
  assert.match(plist, /<integer>12<\/integer><key>Minute<\/key><integer>30<\/integer>/)
  assert.match(plist, new RegExp(`${escapeRegExp(projectDir)}/scripts/run-daily-content\\.sh`))
  assert.equal((await fs.stat(publisherEnv)).mode & 0o777, 0o600)
  assert.match(stdout, /登录时幂等补跑/)
} finally {
  await fs.rm(testHome, { recursive: true, force: true })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

console.log('日更 launchd 配置测试通过：登录补跑、三次日频触发与凭据权限均已固化。')

#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const projectDir = path.resolve(import.meta.dirname, '..', '..')
const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wechat-rss-fetch-test-'))
const passwordFile = path.join(temporaryDir, 'password')
const stateFile = path.join(temporaryDir, 'sync-state.json')
await fs.writeFile(passwordFile, 'test-only-password\n', { mode: 0o600 })

let updateTime = 100
let updateCalls = 0
const emptyFeed = '<?xml version="1.0"?><rss version="2.0"><channel><title>芝士AI吃鱼</title></channel></rss>'
const server = http.createServer(async (request, response) => {
  if (request.url === '/api/v1/wx/auth/token' && request.method === 'POST') {
    for await (const _chunk of request) { /* consume form body */ }
    return json(response, { access_token: 'test-token' })
  }
  if (request.url === '/api/v1/wx/auth/qr/status') {
    return json(response, { data: { login_status: true } })
  }
  if (request.url === '/api/v1/wx/mps/MP_WXS_3212677307') {
    return json(response, { data: { id: 'MP_WXS_3212677307', update_time: updateTime } })
  }
  if (request.url?.startsWith('/api/v1/wx/mps/update/MP_WXS_3212677307')) {
    updateCalls += 1
    updateTime += 1
    return json(response, { code: 0, data: {} })
  }
  if (request.url?.startsWith('/feed/MP_WXS_3212677307.rss')) {
    response.writeHead(200, { 'Content-Type': 'application/rss+xml' })
    return response.end(emptyFeed)
  }
  response.writeHead(404)
  response.end()
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
const env = {
  ...process.env,
  WECHAT_RSS_ADMIN_BASE_URL: `http://127.0.0.1:${address.port}`,
  WECHAT_RSS_PASSWORD_FILE: passwordFile,
  WECHAT_RSS_SYNC_STATE_FILE: stateFile,
  WECHAT_RSS_POLL_INTERVAL_MS: '10',
  WECHAT_RSS_SETTLE_MS: '10',
}

try {
  const first = await execFileAsync(process.execPath, ['scripts/fetch-wechat-rss.mjs'], {
    cwd: projectDir,
    env,
  })
  assert.equal(first.stdout, emptyFeed)
  assert.match(first.stderr, /采集后仍为 0 篇/)
  assert.equal(updateCalls, 1)
  const state = JSON.parse(await fs.readFile(stateFile, 'utf8'))
  assert.equal(state.consecutiveEmptyUpdates, 1)
  assert.equal(state.lastResult, 'empty-after-update')
  assert.equal((await fs.stat(stateFile)).mode & 0o777, 0o600)

  const second = await execFileAsync(process.execPath, ['scripts/fetch-wechat-rss.mjs'], {
    cwd: projectDir,
    env,
  })
  assert.equal(second.stdout, emptyFeed)
  assert.match(second.stderr, /处于保护性退避/)
  assert.equal(updateCalls, 1)
  console.log('公众号 RSS 采集集成测试通过：首次空结果写入私有退避状态，后续只读 Feed。')
} finally {
  await new Promise((resolve) => server.close(resolve))
  await fs.rm(temporaryDir, { recursive: true, force: true })
}

function json(response, value) {
  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(value))
}

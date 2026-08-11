#!/usr/bin/env node

import assert from 'node:assert/strict'
import { checkProductionHealth } from '../lib/production-health.mjs'

const expectedCommit = 'a'.repeat(40)
const baseUrl = 'https://example.com'

let report = await checkProductionHealth({
  baseUrl,
  expectedCommit,
  fetchImpl: healthyFetch(expectedCommit),
})
assert.equal(report.status, 'healthy')
assert.deepEqual(report.issues, [])
assert.equal(report.endpoints.homepage, 200)
assert.equal(report.endpoints.health, 200)
assert.equal(report.deployedCommit, expectedCommit)

report = await checkProductionHealth({
  baseUrl,
  expectedCommit,
  fetchImpl: healthyFetch('b'.repeat(40)),
})
assert.equal(report.status, 'unhealthy')
assert.deepEqual(report.issues, ['production-commit-drift'])

report = await checkProductionHealth({
  baseUrl,
  expectedCommit,
  fetchImpl: async (url) => url.endsWith('/api/health')
    ? new Response('{"ok":false}', { status: 200 })
    : new Response('maintenance', { status: 503 }),
})
assert.equal(report.status, 'unhealthy')
assert.deepEqual(report.issues, [
  'homepage-http-503',
  'health-not-ok',
  'health-commit-missing',
  'production-commit-drift',
])

report = await checkProductionHealth({
  baseUrl,
  fetchImpl: async () => { throw new Error('network unavailable') },
})
assert.deepEqual(report.issues, ['homepage-unreachable', 'health-unreachable'])

await assert.rejects(
  checkProductionHealth({ baseUrl: 'http://example.com' }),
  /必须使用 HTTPS/,
)
await assert.rejects(
  checkProductionHealth({ baseUrl, expectedCommit: 'main' }),
  /40 位 Git 提交 SHA/,
)

function healthyFetch(commit) {
  return async (url) => url.endsWith('/api/health')
    ? Response.json({ ok: true, commit })
    : new Response('<!doctype html><title>ok</title>', { status: 200 })
}

console.log('生产健康巡检测试通过：首页、健康接口、提交漂移与网络异常均可解释。')

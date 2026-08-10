#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import {
  normalizeWechatRssSyncState,
  recordWechatRssUpdate,
  shouldAttemptWechatRssUpdate,
} from './lib/wechat-rss-backoff.mjs'

const baseUrl = (process.env.WECHAT_RSS_ADMIN_BASE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
const feedId = process.env.WECHAT_RSS_FEED_ID || 'MP_WXS_3212677307'
const passwordFile = process.env.WECHAT_RSS_PASSWORD_FILE || '/opt/we-mp-rss/admin-password'
const stateFile = process.env.WECHAT_RSS_SYNC_STATE_FILE || '/opt/we-mp-rss/sync-state.json'
const username = process.env.WECHAT_RSS_USERNAME || 'admin'
const maxPages = Math.min(10, Math.max(1, Number(process.env.WECHAT_RSS_SYNC_PAGES || 1)))
const emptyBackoffHours = Number(process.env.WECHAT_RSS_EMPTY_BACKOFF_HOURS || 48)
const maxBackoffHours = Number(process.env.WECHAT_RSS_MAX_BACKOFF_HOURS || 168)
const pollIntervalMs = Math.min(5_000, Math.max(10, Number(process.env.WECHAT_RSS_POLL_INTERVAL_MS || 5_000)))
const settleMs = Math.min(60_000, Math.max(10, Number(process.env.WECHAT_RSS_SETTLE_MS || 25_000)))

const password = (await fs.readFile(passwordFile, 'utf8')).trim()
if (!password) throw new Error('We-MP-RSS 管理密码文件为空。')

const form = new URLSearchParams({ username, password })
const tokenResponse = await fetch(`${baseUrl}/api/v1/wx/auth/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form,
  signal: AbortSignal.timeout(30_000),
})
const tokenResult = await tokenResponse.json()
if (!tokenResponse.ok || !tokenResult.access_token) {
  throw new Error(`We-MP-RSS 管理登录失败：HTTP ${tokenResponse.status}`)
}
const headers = { Authorization: `Bearer ${tokenResult.access_token}` }

const statusResponse = await fetch(`${baseUrl}/api/v1/wx/auth/qr/status`, {
  headers,
  signal: AbortSignal.timeout(30_000),
})
const statusResult = await statusResponse.json()
const wechatStatus = statusResult.data || statusResult.detail || statusResult
if (!statusResponse.ok || wechatStatus.login_status !== true) {
  throw new Error('We-MP-RSS 微信授权已过期：请通过 SSH 隧道打开管理端并重新扫码。')
}

const detailUrl = `${baseUrl}/api/v1/wx/mps/${encodeURIComponent(feedId)}`
const detailResponse = await fetch(detailUrl, { signal: AbortSignal.timeout(30_000) })
const detailResult = await detailResponse.json()
const previousUpdateTime = Number(detailResult.data?.update_time || 0)
if (!detailResponse.ok || !detailResult.data?.id) {
  throw new Error(`We-MP-RSS 订阅不存在：${feedId}`)
}

const feedUrl = `${baseUrl}/feed/${encodeURIComponent(feedId)}.rss?limit=50`
const currentXml = await fetchFeed(feedUrl)
const syncState = normalizeWechatRssSyncState(await readJson(stateFile, {}))
const attempt = shouldAttemptWechatRssUpdate({ state: syncState })
if (!attempt.allowed) {
  console.error(`We-MP-RSS 处于保护性退避，${attempt.backoffUntil} 后再触发文章采集；本次只读取现有 Feed。`)
  await new Promise((resolve) => process.stdout.write(currentXml, resolve))
  process.exit(0)
}

const updateUrl = new URL(`${baseUrl}/api/v1/wx/mps/update/${encodeURIComponent(feedId)}`)
updateUrl.searchParams.set('start_page', '0')
updateUrl.searchParams.set('end_page', String(maxPages))
const updateResponse = await fetch(updateUrl, { headers, signal: AbortSignal.timeout(30_000) })
const updateResult = await updateResponse.json()
if (!updateResponse.ok || updateResult.code !== 0) {
  throw new Error(`We-MP-RSS 采集任务启动失败：${updateResult.message || updateResult.detail?.message || updateResponse.status}`)
}

let completed = false
for (let attempt = 1; attempt <= 36; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  const response = await fetch(detailUrl, { signal: AbortSignal.timeout(30_000) })
  const result = await response.json()
  if (Number(result.data?.update_time || 0) > previousUpdateTime) {
    completed = true
    break
  }
  console.error(`等待公众号采集任务完成：${attempt}/36`)
}
if (!completed) throw new Error('We-MP-RSS 采集任务等待超时。')
// We-MP-RSS updates update_time before its background crawler has actually
// completed. Give the one-page collection enough time to settle before
// deciding that an empty feed needs protective backoff.
await new Promise((resolve) => setTimeout(resolve, settleMs))

const xml = await fetchFeed(`${feedUrl}&is_update=true`)
const itemCount = countFeedItems(xml)
const nextState = recordWechatRssUpdate({
  state: syncState,
  itemCount,
  emptyBackoffHours,
  maxBackoffHours,
})
await writeJsonPrivate(stateFile, nextState)
if (itemCount === 0) {
  console.error(`We-MP-RSS 授权与订阅有效，但采集后仍为 0 篇；为避免持续触发微信频控，${nextState.backoffUntil} 前不再请求文章列表。`)
}
process.stdout.write(xml)

async function fetchFeed(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  const xml = await response.text()
  if (!response.ok) throw new Error(`We-MP-RSS Feed 请求失败：HTTP ${response.status}`)
  return xml
}

function countFeedItems(xml) {
  return (xml.match(/<item(?:\s|>)/gi) || []).length + (xml.match(/<entry(?:\s|>)/gi) || []).length
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeJsonPrivate(file, value) {
  const directory = path.dirname(file)
  const temporary = `${file}.${process.pid}.tmp`
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await fs.rename(temporary, file)
  await fs.chmod(file, 0o600)
}

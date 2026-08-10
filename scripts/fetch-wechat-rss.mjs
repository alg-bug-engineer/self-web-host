#!/usr/bin/env node

import fs from 'node:fs/promises'

const baseUrl = (process.env.WECHAT_RSS_ADMIN_BASE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
const feedId = process.env.WECHAT_RSS_FEED_ID || 'MP_WXS_3212677307'
const passwordFile = process.env.WECHAT_RSS_PASSWORD_FILE || '/opt/we-mp-rss/admin-password'
const username = process.env.WECHAT_RSS_USERNAME || 'admin'
const maxPages = Math.min(10, Math.max(1, Number(process.env.WECHAT_RSS_SYNC_PAGES || 1)))

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

const updateUrl = new URL(`${baseUrl}/api/v1/wx/mps/update/${encodeURIComponent(feedId)}`)
updateUrl.searchParams.set('start_page', '0')
updateUrl.searchParams.set('end_page', String(maxPages))
const updateResponse = await fetch(updateUrl, { headers, signal: AbortSignal.timeout(30_000) })
const updateResult = await updateResponse.json()
if (!updateResponse.ok || updateResult.code !== 0) {
  throw new Error(`We-MP-RSS 采集任务启动失败：${updateResult.message || updateResult.detail?.message || updateResponse.status}`)
}

const feedUrl = `${baseUrl}/feed/${encodeURIComponent(feedId)}.rss?limit=50&is_update=true`
let completed = false
for (let attempt = 1; attempt <= 36; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5_000))
  const response = await fetch(detailUrl, { signal: AbortSignal.timeout(30_000) })
  const result = await response.json()
  if (Number(result.data?.update_time || 0) > previousUpdateTime) {
    completed = true
    break
  }
  console.error(`等待公众号采集任务完成：${attempt}/36`)
}
if (!completed) throw new Error('We-MP-RSS 采集任务等待超时。')

const feedResponse = await fetch(feedUrl, { signal: AbortSignal.timeout(30_000) })
const xml = await feedResponse.text()
if (!feedResponse.ok) throw new Error(`We-MP-RSS Feed 请求失败：HTTP ${feedResponse.status}`)
if (!/<item(?:\s|>)/i.test(xml) && !/<entry(?:\s|>)/i.test(xml)) {
  console.error('We-MP-RSS 授权与订阅有效，但 Feed 暂无文章；按日频等待下一次采集。')
}
process.stdout.write(xml)

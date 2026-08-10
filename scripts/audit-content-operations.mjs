#!/usr/bin/env node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import nextEnv from '@next/env'
import { buildContentOperationsReport } from './lib/content-operations.mjs'
import { parseArticle } from './lib/content-diversity.mjs'

const projectDir = process.cwd()
nextEnv.loadEnvConfig(projectDir)
const dataDir = process.env.ANALYTICS_DATA_DIR || path.join(projectDir, 'data')
const outputDir = path.join(dataDir, 'operator')
const outputPath = path.join(outputDir, 'content-latest.json')
const postsDir = path.join(projectDir, 'content', 'posts')
const manifestsDir = path.join(projectDir, 'content', 'wechat')
const publishStatePath = process.env.WECHAT_PUBLISH_STATE_FILE || path.join(os.homedir(), '.config', 'ai-knowledgepoints', 'wechat-publish-state.json')

const articles = []
for (const filename of await fs.readdir(postsDir)) {
  if (!filename.endsWith('.mdx')) continue
  articles.push(parseArticle(await fs.readFile(path.join(postsDir, filename), 'utf8'), filename))
}

const manifests = []
for (const filename of await fs.readdir(manifestsDir)) {
  if (!/^daily-.*\.json$/.test(filename)) continue
  try {
    manifests.push(JSON.parse(await fs.readFile(path.join(manifestsDir, filename), 'utf8')))
  } catch {
    // Invalid manifests are surfaced by the missing-manifest comparison below.
  }
}

const publishState = await readJson(publishStatePath, {})
const rss = await inspectWechatRss()
const report = buildContentOperationsReport({ articles, manifests, publishState, rss })

await fs.mkdir(outputDir, { recursive: true, mode: 0o700 })
await fs.chmod(outputDir, 0o700).catch(() => undefined)
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(`内容运营巡检完成：${report.status}，问题 ${report.issues.length} 项`)
console.log(`私有报告：${outputPath}`)

async function inspectWechatRss() {
  const checkedAt = new Date().toISOString()
  const baseUrl = (process.env.WECHAT_RSS_ADMIN_BASE_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
  const passwordFile = process.env.WECHAT_RSS_PASSWORD_FILE || '/opt/we-mp-rss/admin-password'
  const feedId = process.env.WECHAT_RSS_FEED_ID || 'MP_WXS_3212677307'
  try {
    const password = (await fs.readFile(passwordFile, 'utf8')).trim()
    if (!password) throw new Error('empty-password')
    const form = new URLSearchParams({ username: process.env.WECHAT_RSS_USERNAME || 'admin', password })
    const authResponse = await fetch(`${baseUrl}/api/v1/wx/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(20_000),
    })
    const auth = await authResponse.json()
    if (!authResponse.ok || !auth.access_token) throw new Error('admin-auth-failed')
    const headers = { Authorization: `Bearer ${auth.access_token}` }
    const [statusResponse, detailResponse, feedResponse] = await Promise.all([
      fetch(`${baseUrl}/api/v1/wx/auth/qr/status`, { headers, signal: AbortSignal.timeout(20_000) }),
      fetch(`${baseUrl}/api/v1/wx/mps/${encodeURIComponent(feedId)}`, { signal: AbortSignal.timeout(20_000) }),
      fetch(`${baseUrl}/feed/${encodeURIComponent(feedId)}.rss?limit=50`, { signal: AbortSignal.timeout(20_000) }),
    ])
    const status = await statusResponse.json()
    const detail = await detailResponse.json()
    const xml = await feedResponse.text()
    if (!statusResponse.ok || !detailResponse.ok || !feedResponse.ok) throw new Error('rss-read-failed')
    return {
      checked: true,
      reachable: true,
      loginStatus: status.data?.login_status === true,
      feedExists: Boolean(detail.data?.id),
      feedName: detail.data?.mp_name || detail.data?.name || null,
      itemCount: (xml.match(/<item(?:\s|>)/gi) || []).length,
      checkedAt,
    }
  } catch {
    return { checked: true, reachable: false, loginStatus: null, feedExists: null, itemCount: null, checkedAt }
  }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return fallback }
}

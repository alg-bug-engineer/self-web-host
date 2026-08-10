#!/usr/bin/env node

import {
  buildIndexNowPayload,
  changedFilesBetween,
  chunkUrls,
  loadIndexNowConfig,
  loadPublishedPostPaths,
  mapChangedFilesToUrls,
  urlsFromSitemap,
} from './lib/indexnow.mjs'

const projectDir = process.cwd()
const config = await loadIndexNowConfig(projectDir)
const fromCommit = process.env.INDEXNOW_PREVIOUS_COMMIT || process.argv[2] || ''
const toCommit = process.env.INDEXNOW_COMMIT || process.env.GITHUB_SHA || process.argv[3] || ''
const explicitFiles = (process.env.INDEXNOW_CHANGED_FILES || '')
  .split(/[\n,]/)
  .map((item) => item.trim())
  .filter(Boolean)
const publishedPostPaths = await loadPublishedPostPaths(projectDir)
const changedFiles = explicitFiles.length
  ? explicitFiles
  : await changedFilesBetween(projectDir, fromCommit, toCommit)
const mapped = mapChangedFilesToUrls(changedFiles, { siteUrl: config.siteUrl, publishedPostPaths })

let urls = mapped.urls
if (mapped.needsFullSitemap || !changedFiles.length) {
  const sitemapResponse = await fetch(new URL('/sitemap.xml', config.siteUrl), {
    headers: { 'User-Agent': 'ai-knowledgepoints-indexnow/1.0' },
    signal: AbortSignal.timeout(20_000),
  })
  const sitemapXml = await sitemapResponse.text()
  if (!sitemapResponse.ok) throw new Error(`IndexNow 读取线上 Sitemap 失败：HTTP ${sitemapResponse.status}`)
  urls = [...new Set([...urls, ...urlsFromSitemap(sitemapXml, config.siteUrl)])]
}

if (!urls.length) {
  console.log(`IndexNow：${changedFiles.length} 个变更文件没有对应公开可索引页面，跳过通知。`)
  process.exit(0)
}

const urlBatches = chunkUrls([...new Set(urls)], config.maxUrlsPerSubmission)
const firstPayload = buildIndexNowPayload(config, urlBatches[0])
const keyResponse = await fetch(firstPayload.keyLocation, {
  headers: { 'User-Agent': 'ai-knowledgepoints-indexnow/1.0' },
  signal: AbortSignal.timeout(20_000),
})
const hostedKey = (await keyResponse.text()).trim()
if (!keyResponse.ok || hostedKey !== config.key) {
  throw new Error(`IndexNow 线上验证文件不可用：HTTP ${keyResponse.status}`)
}

if (process.env.INDEXNOW_DRY_RUN === 'true') {
  console.log(`IndexNow dry-run：将分 ${urlBatches.length} 批通知 ${urls.length} 个公开 URL。`)
  process.exit(0)
}

let submitted = 0
for (const [batchIndex, urlBatch] of urlBatches.entries()) {
  const payload = buildIndexNowPayload(config, urlBatch)
  let lastFailure = ''
  let accepted = false
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'ai-knowledgepoints-indexnow/1.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
    const responseText = (await response.text()).replace(/[\r\n]+/g, ' ').slice(0, 240)
    if (response.status === 200 || response.status === 202) {
      submitted += payload.urlList.length
      accepted = true
      console.log(`IndexNow 第 ${batchIndex + 1}/${urlBatches.length} 批已接收：${payload.urlList.length} 个 URL，HTTP ${response.status}`)
      break
    }
    lastFailure = `HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
  }
  if (!accepted) throw new Error(`IndexNow 第 ${batchIndex + 1} 批连续 3 次通知失败：${lastFailure}`)
}

console.log(`IndexNow 通知完成：共 ${submitted} 个公开 URL。`)

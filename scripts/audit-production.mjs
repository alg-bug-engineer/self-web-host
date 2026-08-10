#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import nextEnv from '@next/env'

const projectDir = process.cwd()
nextEnv.loadEnvConfig(projectDir)
const siteUrl = new URL(process.env.SITE_URL || 'https://ai-knowledgepoints.cn')
const dataDir = process.env.ANALYTICS_DATA_DIR || path.join(projectDir, 'data')
const outputDir = path.join(dataDir, 'operator')
const outputPath = path.join(outputDir, 'technical-latest.json')
const issues = []
const checkedAt = new Date().toISOString()
const userAgent = 'ai-knowledgepoints-technical-audit/1.0'

const addIssue = (severity, check, target, message) => {
  issues.push({ severity, check, target, message })
}

let indexNowConfig = null
try {
  indexNowConfig = JSON.parse(await fs.readFile(path.join(projectDir, 'ops', 'indexnow.json'), 'utf8'))
} catch (error) {
  addIssue('warning', 'indexnow', siteUrl.origin, `无法读取 IndexNow 配置：${error instanceof Error ? error.message : String(error)}`)
}

const fetchText = async (target) => {
  try {
    const response = await fetch(target, {
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
    return { response, text: await response.text(), error: null }
  } catch (error) {
    return { response: null, text: '', error: error instanceof Error ? error.message : String(error) }
  }
}

const absolute = (pathname) => new URL(pathname, siteUrl).toString()
const normalizeUrl = (value) => {
  const url = new URL(value, siteUrl)
  url.hash = ''
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1] || ''
const canonicalFrom = (html) => {
  const tag = html.match(/<link\b[^>]*\brel=["'][^"']*canonical[^"']*["'][^>]*>/i)?.[0]
  return tag ? attribute(tag, 'href') : ''
}
const robotsFrom = (html) => {
  const tag = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0]
  return tag ? attribute(tag, 'content').toLowerCase() : ''
}
const jsonLdFrom = (html) => [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
const internalLinksFrom = (html) => [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)]
  .map((match) => match[1].trim())
  .filter((href) => href && !href.startsWith('#') && !/^(mailto:|tel:|javascript:)/i.test(href))
  .flatMap((href) => {
    try {
      const url = new URL(href, siteUrl)
      return url.origin === siteUrl.origin && !url.pathname.startsWith('/api/') ? [normalizeUrl(url)] : []
    } catch {
      return []
    }
  })

const health = await fetchText(absolute('/api/health'))
let healthOk = false
if (!health.response?.ok) {
  addIssue('error', 'health', absolute('/api/health'), health.error || `HTTP ${health.response?.status}`)
} else {
  try {
    healthOk = JSON.parse(health.text).ok === true
  } catch {
    addIssue('error', 'health', absolute('/api/health'), '健康接口不是合法 JSON。')
  }
}

const sitemap = await fetchText(absolute('/sitemap.xml'))
const sitemapUrls = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean)
if (!sitemap.response?.ok || !sitemapUrls.length) {
  addIssue('error', 'sitemap', absolute('/sitemap.xml'), sitemap.error || 'Sitemap 不可用或没有 URL。')
}

const pageResults = await mapLimit([...new Set(sitemapUrls)], 5, async (target) => {
  const result = await fetchText(target)
  if (!result.response?.ok) {
    addIssue('error', 'page-status', target, result.error || `HTTP ${result.response?.status}`)
    return { target, html: '', status: result.response?.status || 0 }
  }

  const canonical = canonicalFrom(result.text)
  if (!canonical) {
    addIssue('error', 'canonical', target, '页面缺少 canonical。')
  } else if (normalizeUrl(canonical) !== normalizeUrl(target)) {
    addIssue('error', 'canonical', target, `canonical 指向 ${canonical}`)
  }
  if (robotsFrom(result.text).includes('noindex')) {
    addIssue('error', 'indexability', target, 'Sitemap 页面被标记为 noindex。')
  }

  const jsonLdBlocks = jsonLdFrom(result.text)
  if (new URL(target).pathname === '/' || new URL(target).pathname.startsWith('/blog/')) {
    if (!jsonLdBlocks.length) addIssue('warning', 'structured-data', target, '核心页面缺少 JSON-LD。')
  }
  for (const block of jsonLdBlocks) {
    try {
      JSON.parse(block)
    } catch {
      addIssue('error', 'structured-data', target, '存在无法解析的 JSON-LD。')
    }
  }

  return { target, html: result.text, status: result.response.status }
})

const internalLinks = [...new Set(pageResults.flatMap((page) => internalLinksFrom(page.html)))].slice(0, 300)
await mapLimit(internalLinks, 8, async (target) => {
  const result = await fetchText(target)
  if (!result.response?.ok) addIssue('error', 'internal-link', target, result.error || `HTTP ${result.response?.status}`)
})

const robots = await fetchText(absolute('/robots.txt'))
if (!robots.response?.ok || !/Sitemap:\s*https:\/\/ai-knowledgepoints\.cn\/sitemap\.xml/i.test(robots.text)) {
  addIssue('error', 'robots', absolute('/robots.txt'), 'robots.txt 不可用或缺少 Sitemap 声明。')
}
const feed = await fetchText(absolute('/feed.xml'))
if (!feed.response?.ok || !/<rss\b/i.test(feed.text) || !/<item\b/i.test(feed.text)) {
  addIssue('error', 'rss', absolute('/feed.xml'), 'RSS 不可用或没有文章。')
}
const llms = await fetchText(absolute('/llms.txt'))
if (!llms.response?.ok || !/芝士AI吃鱼/.test(llms.text) || !/https:\/\/ai-knowledgepoints\.cn/.test(llms.text)) {
  addIssue('warning', 'geo', absolute('/llms.txt'), 'llms.txt 缺少站点或作者核心信息。')
}
const articleUrls = sitemapUrls.filter((target) => new URL(target).pathname.startsWith('/blog/'))
const markdownResults = await mapLimit(articleUrls, 5, async (articleUrl) => {
  const markdownUrl = `${articleUrl.replace(/\/+$/, '')}/index.html.md`
  const result = await fetchText(markdownUrl)
  const contentType = result.response?.headers.get('content-type') || ''
  const canonicalHeader = result.response?.headers.get('link') || ''
  const healthy = result.response?.ok === true
    && contentType.toLowerCase().includes('text/markdown')
    && /^#\s+\S/m.test(result.text)
    && /## 正文/.test(result.text)
    && result.text.includes(articleUrl)
    && canonicalHeader.includes(`rel="canonical"`)
    && !/<\/?(?:InfoCard|TwoColumnLayout|Left|Right)\b/.test(result.text)
  if (!healthy) {
    addIssue('error', 'geo-markdown', markdownUrl, result.error || '文章 Markdown 不可用、元数据不完整或仍包含展示组件标签。')
  }
  if (!llms.text.includes(markdownUrl)) {
    addIssue('warning', 'geo-discovery', markdownUrl, 'llms.txt 未引用该文章的 Markdown 版本。')
  }
  return { markdownUrl, healthy }
})
let indexNowKeyOk = false
if (indexNowConfig?.key && indexNowConfig?.keyFile) {
  const keyLocation = absolute(`/${indexNowConfig.keyFile}`)
  const indexNowKey = await fetchText(keyLocation)
  indexNowKeyOk = indexNowKey.response?.ok === true && indexNowKey.text.trim() === indexNowConfig.key
  if (!indexNowKeyOk) {
    addIssue('error', 'indexnow', keyLocation, 'IndexNow 域名验证文件不可用或内容与配置不一致。')
  }
}
const search = await fetchText(absolute('/search'))
if (!search.response?.ok || !robotsFrom(search.text).includes('noindex')) {
  addIssue('error', 'indexability', absolute('/search'), '站内搜索页未正确设置 noindex。')
}

const homepage = pageResults.find((page) => normalizeUrl(page.target) === normalizeUrl(siteUrl))
let homepageHeaders = null
if (homepage) {
  try {
    homepageHeaders = (await fetch(absolute('/'), {
      method: 'HEAD',
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(20_000),
    })).headers
  } catch (error) {
    addIssue('error', 'security-header', absolute('/'), error instanceof Error ? error.message : String(error))
  }
}
const requiredHeaders = {
  'strict-transport-security': 'HSTS',
  'x-content-type-options': 'X-Content-Type-Options',
  'referrer-policy': 'Referrer-Policy',
  'permissions-policy': 'Permissions-Policy',
}
for (const [header, label] of Object.entries(requiredHeaders)) {
  if (!homepageHeaders?.get(header)) addIssue('warning', 'security-header', absolute('/'), `缺少 ${label}。`)
}

const report = {
  version: 2,
  checkedAt,
  target: siteUrl.origin,
  status: issues.some((issue) => issue.severity === 'error') ? 'degraded' : 'healthy',
  metrics: {
    healthOk,
    sitemapPages: sitemapUrls.length,
    successfulPages: pageResults.filter((page) => page.status === 200).length,
    internalLinksChecked: internalLinks.length,
    markdownPagesChecked: markdownResults.length,
    markdownPagesHealthy: markdownResults.filter((item) => item.healthy).length,
    indexNowKeyOk,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  },
  issues,
}

await fs.mkdir(outputDir, { recursive: true, mode: 0o700 })
await fs.chmod(outputDir, 0o700).catch(() => undefined)
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
console.log(`生产技术巡检完成：${report.status}，错误 ${report.metrics.errors}，警告 ${report.metrics.warnings}`)
console.log(`私有报告：${outputPath}`)

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

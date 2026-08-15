import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import TurndownService from 'turndown'
import { localizeWechatHtmlImages, normalizeWechatImages } from './lib/wechat-images.mjs'

const feedUrl = process.env.WECHAT_RSS_URL?.trim()
const feedFile = process.env.WECHAT_RSS_FILE?.trim()
const htmlFile = process.env.WECHAT_HTML_FILE?.trim()
const autoPublish = process.env.WECHAT_AUTO_PUBLISH === 'true'
const postsDir = path.resolve(process.cwd(), process.env.WECHAT_POSTS_DIR?.trim() || path.join('content', 'posts'))
const publicDir = path.resolve(process.cwd(), process.env.WECHAT_PUBLIC_DIR?.trim() || 'public')
const localizeImages = process.env.WECHAT_LOCALIZE_IMAGES !== 'false'
const expectedBiz = process.env.WECHAT_EXPECTED_BIZ?.trim() || 'MzIxMjY3NzMwNw=='
const expectedFeedId = process.env.WECHAT_EXPECTED_FEED_ID?.trim() || ''
const importDays = Math.min(90, Math.max(1, Number.parseInt(process.env.WECHAT_IMPORT_DAYS || '31', 10) || 31))
const maxImports = Math.min(20, Math.max(1, Number.parseInt(process.env.WECHAT_MAX_IMPORTS || '12', 10) || 12))
const now = new Date(process.env.WECHAT_NOW || Date.now())
if (Number.isNaN(now.getTime())) throw new Error('WECHAT_NOW 不是有效日期。')
const cutoff = new Date(now)
cutoff.setUTCDate(cutoff.getUTCDate() - importDays)

if (!feedUrl && !feedFile && !htmlFile) {
  console.log('未配置公众号 RSS 或文章 HTML，跳过同步。')
  process.exit(0)
}

const items = htmlFile ? [await htmlItem(htmlFile)] : await rssFeedItems(feedUrl, feedFile)

if (!items.length) {
  console.log('公众号 RSS 暂无文章条目：新增 0 篇。')
  process.exit(0)
}

await fs.mkdir(postsDir, { recursive: true })
const existingFiles = await fs.readdir(postsDir)
const existingContent = await Promise.all(
  existingFiles
    .filter((filename) => filename.endsWith('.mdx'))
    .map((filename) => fs.readFile(path.join(postsDir, filename), 'utf8')),
)
const existingArticleKeys = new Set(existingContent.flatMap((content) => {
  const encoded = content.match(/^sourceUrl:\s*(.+)$/m)?.[1]
  if (!encoded) return []
  try {
    return [wechatArticleKey(JSON.parse(encoded))]
  } catch {
    return []
  }
}).filter(Boolean))

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
turndown.remove(['script', 'style', 'noscript'])

let created = 0
for (const item of items) {
  const title = textValue(item.title).trim()
  const rawSourceUrl = linkValue(item.link) || textValue(item.guid) || textValue(item.id)
  const sourceUrl = normalizeWechatUrl(rawSourceUrl, textValue(item.id))
  const articleKey = wechatArticleKey(sourceUrl)
  if (!title || !sourceUrl || !articleKey || existingArticleKeys.has(articleKey)) {
    continue
  }

  const rawHtml =
    textValue(item['content:encoded']) ||
    textValue(item.content) ||
    textValue(item.description) ||
    textValue(item.summary)
  const description = stripHtml(textValue(item.description) || textValue(item.summary) || rawHtml)
    .slice(0, 180)
    .trim()
  const dateValue = textValue(item.pubDate) || textValue(item.published) || textValue(item.updated)
  const date = Number.isNaN(Date.parse(dateValue)) ? null : new Date(dateValue)
  if (!date || date < cutoff || date > now) continue
  const slug = `wechat-${date.toISOString().slice(0, 10)}-${crypto
    .createHash('sha1')
    .update(articleKey)
    .digest('hex')
    .slice(0, 8)}`
  const normalizedHtml = normalizeWechatImages(rawHtml)
  const candidateMarkdown = markdownFromHtml(normalizedHtml)
  if (candidateMarkdown.length < 200) continue
  const articleHtml = localizeImages
    ? await localizeWechatHtmlImages(normalizedHtml, { slug, publicDir })
    : normalizedHtml
  const markdown = markdownFromHtml(articleHtml)

  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description || title)}`,
    `date: ${date.toISOString()}`,
    'author: 芝士AI吃鱼',
    'tags:',
    '  - 公众号同步',
    '  - AI',
    'icon: robot',
    `published: ${autoPublish}`,
    `sourceUrl: ${JSON.stringify(sourceUrl)}`,
    'sourceName: 芝士AI吃鱼公众号',
    '---',
    '',
  ].join('\n')

  await fs.writeFile(
    path.join(postsDir, `${slug}.mdx`),
    `${frontmatter}\n> 本文同步自「芝士AI吃鱼」公众号，原文链接见文章信息。\n\n${markdown}\n`,
    'utf8',
  )
  created += 1
  existingArticleKeys.add(articleKey)
  if (created >= maxImports) break
}

console.log(`公众号同步完成：新增 ${created} 篇${autoPublish ? '已发布文章' : '待审核草稿'}。`)

async function rssFeedItems(url, file) {
  let feedXml
  if (file) {
    feedXml = await fs.readFile(path.resolve(process.cwd(), file), 'utf8')
  } else {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ai-knowledgepoints-wechat-sync/1.0' },
    })
    if (!response.ok) {
      throw new Error(`公众号 RSS 请求失败：${response.status} ${response.statusText}`)
    }
    feedXml = await response.text()
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  })
  const document = parser.parse(feedXml)
  const hasRssChannel = Boolean(document?.rss) && Object.hasOwn(document.rss, 'channel')
  const hasAtomFeed = Boolean(document?.feed)
  if (!hasRssChannel && !hasAtomFeed) {
    throw new Error('公众号 RSS 不是有效的 RSS 或 Atom Feed。')
  }
  const rssItems = toArray(document?.rss?.channel?.item)
  const atomItems = toArray(document?.feed?.entry)
  return rssItems.length ? rssItems : atomItems
}

async function htmlItem(file) {
  const html = await fs.readFile(path.resolve(process.cwd(), file), 'utf8')
  const article = html.match(
    /<div[^>]*id="js_content"[^>]*>([\s\S]*?<p style="display: none;">[\s\S]*?<\/p>)<\/div>/,
  )?.[1]
  if (!article) throw new Error('文章 HTML 中没有找到 #js_content 正文。')

  const title = process.env.WECHAT_TITLE?.trim() || metaContent(html, 'og:title')
  const description = process.env.WECHAT_DESCRIPTION?.trim() || metaContent(html, 'og:description')
  const sourceUrl = process.env.WECHAT_SOURCE_URL?.trim() || metaContent(html, 'og:url')
  const published = process.env.WECHAT_DATE?.trim() || extractPublishedDate(html)
  if (!title || !sourceUrl) throw new Error('文章 HTML 缺少标题或原文链接。')

  return {
    title,
    link: sourceUrl,
    description,
    pubDate: published,
    'content:encoded': article,
  }
}

function metaContent(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.match(new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)`, 'i'))?.[1] || ''
}

function extractPublishedDate(html) {
  const seconds = html.match(/\bct\s*=\s*["']?(\d{10})/)?.[1]
  return seconds ? new Date(Number(seconds) * 1000).toISOString() : ''
}

function toArray(value) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function textValue(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') return String(value['#text'] || value.__cdata || '')
  return ''
}

function linkValue(value) {
  for (const link of toArray(value)) {
    if (typeof link === 'string') return link
    if (link?.['@_rel'] === 'alternate' && link?.['@_href']) return link['@_href']
    if (link?.['@_href']) return link['@_href']
    if (link?.['#text']) return link['#text']
  }
  return ''
}

function stripHtml(value) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

function markdownFromHtml(value) {
  return turndown
    .turndown(value)
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeWechatUrl(value, itemId = '') {
  try {
    const url = new URL(String(value || '').trim())
    if (url.hostname.toLowerCase() !== 'mp.weixin.qq.com') return ''
    const biz = url.searchParams.get('__biz')
    if (biz) {
      if (expectedBiz && biz !== expectedBiz) return ''
    } else {
      const expectedNumericId = expectedFeedId.match(/^MP_WXS_(\d+)$/)?.[1]
      const isShortArticleUrl = /^\/s\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
      const isExpectedFeedItem = expectedNumericId && itemId.startsWith(`${expectedNumericId}-`)
      if (!isShortArticleUrl || !isExpectedFeedItem) return ''
    }
    url.protocol = 'https:'
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function wechatArticleKey(value) {
  try {
    const url = new URL(value)
    const biz = url.searchParams.get('__biz')
    const mid = url.searchParams.get('mid')
    const idx = url.searchParams.get('idx') || '1'
    if (biz && mid) return `${biz}:${mid}:${idx}`
    return url.toString()
  } catch {
    return ''
  }
}

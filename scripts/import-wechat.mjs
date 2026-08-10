import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import TurndownService from 'turndown'

const feedUrl = process.env.WECHAT_RSS_URL?.trim()
const feedFile = process.env.WECHAT_RSS_FILE?.trim()
const autoPublish = process.env.WECHAT_AUTO_PUBLISH === 'true'
const postsDir = path.join(process.cwd(), 'content', 'posts')

if (!feedUrl && !feedFile) {
  console.log('WECHAT_RSS_URL 与 WECHAT_RSS_FILE 均未配置，跳过公众号同步。')
  process.exit(0)
}

let feedXml
if (feedFile) {
  feedXml = await fs.readFile(path.resolve(process.cwd(), feedFile), 'utf8')
} else {
  const response = await fetch(feedUrl, {
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
const rssItems = toArray(document?.rss?.channel?.item)
const atomItems = toArray(document?.feed?.entry)
const items = rssItems.length ? rssItems : atomItems

if (!items.length) throw new Error('公众号 RSS 中没有找到文章条目。')

await fs.mkdir(postsDir, { recursive: true })
const existingFiles = await fs.readdir(postsDir)
const existingContent = await Promise.all(
  existingFiles
    .filter((filename) => filename.endsWith('.mdx'))
    .map((filename) => fs.readFile(path.join(postsDir, filename), 'utf8')),
)

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
turndown.remove(['script', 'style', 'noscript'])

let created = 0
for (const item of items) {
  const title = textValue(item.title).trim()
  const sourceUrl = linkValue(item.link) || textValue(item.guid) || textValue(item.id)
  if (!title || !sourceUrl || existingContent.some((content) => content.includes(`sourceUrl: ${JSON.stringify(sourceUrl)}`))) {
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
  const date = Number.isNaN(Date.parse(dateValue)) ? new Date() : new Date(dateValue)
  const slug = `wechat-${date.toISOString().slice(0, 10)}-${crypto
    .createHash('sha1')
    .update(sourceUrl)
    .digest('hex')
    .slice(0, 8)}`
  const markdown = turndown
    .turndown(rawHtml)
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .trim()

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
}

console.log(`公众号同步完成：新增 ${created} 篇${autoPublish ? '已发布文章' : '待审核草稿'}。`)

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

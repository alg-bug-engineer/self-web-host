#!/usr/bin/env node
// Zero dependencies: the dispatcher runs this before npm ci in its isolated worker.
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const fields = new Set(['date', 'published', 'postType', 'category', 'topicCluster', 'topicId'])
// Explicit series registry, not title/tag inference. Extend only for a reviewed series.
const technicalSeries = new Map([['rag-engineering', /^rag-evaluation-\d+$/]])

export function publicationDate(value) {
  if (typeof value !== 'string') throw new Error('文章缺少有效 date')
  const calendar = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(calendar) || new Date(`${calendar}T00:00:00Z`).toISOString().slice(0, 10) !== calendar) {
    throw new Error(`无效日期：${value}`)
  }
  // A date without a clock is a Shanghai calendar date; timestamps require an offset.
  if (value === calendar) return calendar
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error(`date 时间戳必须包含时区：${value}`)
  }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error(`无效日期：${value}`)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

export function parsePublication(raw) {
  const match = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error('文章缺少 frontmatter')
  const metadata = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/)
    if (!field || !fields.has(field[1])) continue
    if (Object.hasOwn(metadata, field[1])) throw new Error(`重复字段：${field[1]}`)
    // Deliberately accept only scalar metadata; ambiguous YAML must stop dispatch.
    const scalar = field[2].match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#"'\[\]{},&*!|>]+)(?:\s+#.*)?\s*$/)
    if (!scalar) throw new Error(`无法安全读取字段：${field[1]}`)
    const token = scalar[1]
    const value = token.startsWith('"') ? JSON.parse(token) : token.startsWith("'") ? token.slice(1, -1).replace(/''/g, "'") : token
    if (field[1] === 'published') {
      if (token !== 'true' && token !== 'false') throw new Error('published 必须是布尔值')
      metadata.published = token === 'true'
    } else metadata[field[1]] = value
  }
  metadata.postType ??= 'article'
  metadata.published ??= true // Same defaults as Contentlayer, including legacy posts.
  metadata.category ??= 'tech'
  if (!['article', 'commentary'].includes(metadata.postType)) throw new Error('无效 postType')
  return metadata
}

export function summarizePublications(entries, date) {
  if (publicationDate(date) !== date) throw new Error('目标日期必须为 YYYY-MM-DD')
  const result = { date, timeZone: 'Asia/Shanghai', commentary: [], technicalSeries: [], articles: [] }
  for (const { path, raw } of entries) {
    try {
      const post = parsePublication(raw)
      if (!post.published || publicationDate(post.date) !== date) continue
      if (post.postType === 'commentary') result.commentary.push(path)
      else {
        result.articles.push(path)
        if (post.category === 'tech' && technicalSeries.get(post.topicCluster)?.test(post.topicId || '')) result.technicalSeries.push(path)
      }
    } catch (error) { throw new Error(`${path}: ${error.message}`) }
  }
  result.legacyArticleNeeded = result.articles.length === 0
  return result
}

export function readPublishedDay({ cwd = process.cwd(), date }) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  // Pin one fetched origin/main snapshot. Never read dirty files or unpublished branches.
  const commit = git(['rev-parse', '--verify', 'origin/main^{commit}']).trim()
  const paths = git(['ls-tree', '-rz', '--name-only', commit, '--', 'content/posts']).split('\0').filter((file) => file.endsWith('.mdx'))
  return summarizePublications(paths.map((path) => ({ path, raw: git(['show', `${commit}:${path}`]) })), date)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const status = readPublishedDay({ date: process.env.CONTENT_DATE })
    console.error(`${status.date}（Asia/Shanghai）origin/main：锐评 ${status.commentary.length}/1；技术系列长文 ${status.technicalSeries.length}/1；全部长文 ${status.articles.length}。`)
    if (!status.commentary.length) console.error('待完成：AI 锐评；旧生成器仅生成长文，不能用再次生成长文补锐评。')
    if (!status.technicalSeries.length) console.error('待完成：技术系列长文；旧生成器的常青长文不等于已验证的技术系列，仍需证据、实验和质量审核。')
    console.log(process.argv.includes('--legacy-action') ? (status.legacyArticleNeeded ? 'generate' : 'skip') : JSON.stringify(status, null, 2))
  } catch (error) {
    console.error(`日更发布状态无法确认，停止生成：${error.message}`)
    process.exitCode = 1
  }
}

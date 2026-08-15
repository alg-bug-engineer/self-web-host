import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const required = ['source', 'date', 'slug', 'title', 'description', 'cover']
for (const key of required) if (!args[key]) throw new Error(`缺少 --${toKebab(key)}`)

const sourcePath = path.resolve(projectDir, args.source)
const coverPath = path.resolve(projectDir, args.cover)
await Promise.all([fs.access(sourcePath), fs.access(coverPath)])
const source = await fs.readFile(sourcePath, 'utf8')
const firstHeading = source.match(/^#\s+(.+)$/m)?.[1]?.trim() || ''
if (firstHeading !== args.title) throw new Error(`正文标题与 --title 不一致：${firstHeading || '未找到'}`)
if (!/儿童AI内测/.test(source)) throw new Error('公众号内测承接稿缺少“儿童AI内测”关键词')
if (!/当前只登记意向，不代表录取，也不收费/.test(source)) throw new Error('公众号内测承接稿缺少 intake_only 声明')
if (!/不要发送孩子的姓名、学校/.test(source)) throw new Error('公众号内测承接稿缺少儿童隐私提示')

const markdownBody = source.replace(/^#\s+.+\n+/, '')
const body = String(await unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify)
  .process(markdownBody))
const outputDir = path.resolve(projectDir, args.outputDir || 'content/wechat')
const stem = `${args.date}-${args.slug}`
const htmlPath = path.join(outputDir, `${stem}.html`)
const manifestPath = path.join(outputDir, `${stem}.json`)
await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(htmlPath, `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(args.title)}｜公众号草稿</title></head><body><article>${body}</article></body></html>\n`, 'utf8')

const manifest = {
  version: 1,
  date: args.date,
  slug: args.slug,
  title: args.title,
  description: args.description,
  sourcePath: path.relative(projectDir, sourcePath),
  htmlPath: path.relative(projectDir, htmlPath),
  coverPath: path.relative(projectDir, coverPath),
  websiteUrl: args.websiteUrl || null,
  contentSha256: crypto.createHash('sha256').update(body).digest('hex'),
  releaseGate: 'draft_only_manual_preview',
  authorApproval: {
    status: 'pending',
    approvedAt: null,
    approvedContentSha256: null,
  },
}
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
process.stdout.write(`${path.relative(projectDir, manifestPath)}\n`)

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith('--')) throw new Error(`未知参数：${value}`)
    const key = value.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    parsed[key] = values[++index] || ''
  }
  return parsed
}

function toKebab(value) {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

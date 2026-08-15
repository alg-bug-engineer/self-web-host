#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const projectDir = process.cwd()
const blogHtmlPath = path.join(projectDir, '.next', 'server', 'app', 'blog.html')
const html = await fs.readFile(blogHtmlPath, 'utf8')

if (!html.includes('<title>AI 深度文章与学习路径 | 芝士AI吃鱼</title>')) {
  throw new Error('文章索引页标题缺失或重复品牌名')
}
if (!html.includes('芝士AI吃鱼的 AI 深度文章与学习路径')) {
  throw new Error('文章索引页缺少面向搜索与读者的描述')
}

const requiredVisibleCopy = [
  '不知道从哪篇开始？选一条路径。',
  '从 200 行代码拆开 GPT',
  '看清 Agent 从演示到落地的距离',
  '思考 AI 正在怎样重塑人',
  '模型与原理',
  'Agent 与实践',
  'AI 与人',
]

for (const text of requiredVisibleCopy) {
  if (!html.includes(text)) throw new Error(`文章学习入口缺少可见文案：${text}`)
}

const expectedAnalyticsTargets = [
  'blog-path-principles',
  'blog-path-practice',
  'blog-path-insight',
  'blog-filter-all',
  'blog-filter-principles',
  'blog-filter-practice',
  'blog-filter-insight',
  'blog-proof',
]
for (const target of expectedAnalyticsTargets) {
  if (!html.includes(`data-analytics-target="${target}"`)) {
    throw new Error(`文章学习入口缺少统计目标：${target}`)
  }
}

const jsonLdBlocks = [...html.matchAll(
  /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
)].map((match) => JSON.parse(match[1]))
const graph = jsonLdBlocks
  .map((block) => block['@graph'])
  .find((items) => Array.isArray(items) && items.some((item) => item['@type'] === 'CollectionPage'))
if (!graph) throw new Error('文章索引页缺少 CollectionPage 结构化数据')

const collection = graph.find((item) => item['@type'] === 'CollectionPage')
const itemList = graph.find((item) => item['@type'] === 'ItemList')
const breadcrumb = graph.find((item) => item['@type'] === 'BreadcrumbList')
if (!collection || !itemList || !breadcrumb) throw new Error('文章集合结构化数据不完整')
if (collection.mainEntity?.['@id'] !== itemList['@id']) throw new Error('CollectionPage 未关联文章 ItemList')
if (!Array.isArray(itemList.itemListElement) || itemList.itemListElement.length < 1) {
  throw new Error('文章 ItemList 为空')
}
if (itemList.numberOfItems !== itemList.itemListElement.length) {
  throw new Error('文章 ItemList 数量与列表不一致')
}

const listedUrls = itemList.itemListElement.map((item) => item.url)
if (new Set(listedUrls).size !== listedUrls.length) throw new Error('文章 ItemList 存在重复 URL')
const llmsBody = await fs.readFile(path.join(projectDir, '.next', 'server', 'app', 'llms.txt.body'), 'utf8')
for (const url of listedUrls) {
  if (!url.startsWith('https://ai-knowledgepoints.cn/blog/')) {
    throw new Error(`文章 ItemList URL 不属于本站：${url}`)
  }
  if (!html.includes(`href="${new URL(url).pathname}"`)) {
    throw new Error(`结构化数据文章未在页面中可见：${url}`)
  }
  const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1)
  const markdownUrl = `${url}/index.html.md`
  const markdownDir = path.join(projectDir, '.next', 'server', 'app', 'blog', slug)
  const markdown = await fs.readFile(path.join(markdownDir, 'index.html.md.body'), 'utf8')
  const metadata = JSON.parse(await fs.readFile(path.join(markdownDir, 'index.html.md.meta'), 'utf8'))
  if (!llmsBody.includes(markdownUrl)) throw new Error(`llms.txt 未引用文章 Markdown：${markdownUrl}`)
  if (!metadata.headers?.['content-type']?.includes('text/markdown')) {
    throw new Error(`文章 Markdown 内容类型错误：${markdownUrl}`)
  }
  if (!metadata.headers?.link?.includes(`<${url}>; rel="canonical"`)) {
    throw new Error(`文章 Markdown canonical 错误：${markdownUrl}`)
  }
  if (!/^#\s+\S/m.test(markdown) || !markdown.includes('## 正文') || !markdown.includes(url)) {
    throw new Error(`文章 Markdown 元数据或正文不完整：${markdownUrl}`)
  }
  if (/<\/?(?:InfoCard|TwoColumnLayout|Left|Right)\b/.test(markdown)) {
    throw new Error(`文章 Markdown 仍包含展示组件标签：${markdownUrl}`)
  }
}

console.log(`文章学习入口测试通过：${itemList.numberOfItems} 篇文章及其 Markdown 正文，3 条学习路径，4 个主题筛选。`)

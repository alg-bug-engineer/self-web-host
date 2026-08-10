import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const baseUrl = (process.env.CONTENT_AI_BASE_URL || 'http://127.0.0.1:3000/v1').replace(/\/$/, '')
const apiKey = process.env.CONTENT_AI_API_KEY?.trim()
const model = process.env.CONTENT_AI_MODEL?.trim() || 'auto'
const topic = process.env.CONTENT_TOPIC?.trim()
const webSearch = process.env.CONTENT_WEB_SEARCH === 'true'
const force = process.env.CONTENT_FORCE === 'true'
const dateKey = parseDateKey(process.env.CONTENT_DATE)
const publishedAt = `${dateKey}T08:00:00+08:00`
const postsDir = path.join(process.cwd(), 'content', 'posts')

if (!apiKey) {
  throw new Error('CONTENT_AI_API_KEY 未配置；为避免泄露，密钥只能通过环境变量传入。')
}

await fs.mkdir(postsDir, { recursive: true })
const existingFiles = await fs.readdir(postsDir)
if (!force && existingFiles.some((filename) => filename.startsWith(`daily-${dateKey}-`) && filename.endsWith('.mdx'))) {
  console.log(`${dateKey} 已存在日更草稿，跳过重复生成。`)
  process.exit(0)
}

const prompt = buildPrompt({ dateKey, topic, webSearch })
const payload = {
  model,
  stream: false,
  messages: [
    {
      role: 'system',
      content:
        '你是“芝士AI吃鱼”的中文技术编辑。保持作者判断、真实经验和人味，不编造事实、数据、引语、项目经历或来源。只输出合法 JSON。',
    },
    { role: 'user', content: prompt },
  ],
}

if (webSearch) payload.tools = [{ type: 'web_search' }]

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(180_000),
})

const responseText = await response.text()
if (!response.ok) {
  throw new Error(`内容模型请求失败：HTTP ${response.status} ${safeError(responseText)}`)
}

let envelope
try {
  envelope = JSON.parse(responseText)
} catch {
  throw new Error('内容模型返回的外层响应不是合法 JSON。')
}

const rawContent = envelope?.choices?.[0]?.message?.content
if (typeof rawContent !== 'string' || !rawContent.trim()) {
  throw new Error('内容模型没有返回 choices[0].message.content。')
}

const draft = parseDraft(rawContent)
validateDraft(draft)

const slug = normalizeSlug(draft.slug || draft.title)
const filename = `daily-${dateKey}-${slug}.mdx`
const tags = [...new Set(['AI日更草稿', ...draft.tags.map(cleanLine)])].filter(Boolean).slice(0, 6)
const frontmatter = [
  '---',
  `title: ${JSON.stringify(cleanLine(draft.title))}`,
  `description: ${JSON.stringify(cleanLine(draft.description).slice(0, 180))}`,
  `date: ${publishedAt}`,
  'author: 芝士AI吃鱼',
  'tags:',
  ...tags.map((tag) => `  - ${JSON.stringify(tag)}`),
  'icon: robot',
  'published: false',
  '---',
  '',
].join('\n')

const reviewNotice = [
  '> **编辑状态：AI 日更草稿，尚未发布。**',
  '> 合并前请核对事实、来源、代码、个人经历表述与版权；删除此提示后再将 `published` 改为 `true`。',
  '',
].join('\n')

const output = `${frontmatter}\n${reviewNotice}${escapeMdxBraces(draft.markdown.trim())}\n`
await fs.writeFile(path.join(postsDir, filename), output, { encoding: 'utf8', flag: 'wx' })
console.log(`已生成待审核日更草稿：content/posts/${filename}`)

function buildPrompt({ dateKey, topic, webSearch }) {
  const topicInstruction = topic
    ? `本期选题：${topic}`
    : '请从 AI Agent、RAG、NLP、大模型工程、AI 产品实践中选择一个能长期帮助读者的具体问题，不追逐空洞热点。'
  const researchInstruction = webSearch
    ? '已启用网页搜索。只使用能在正文中明确给出链接的可靠一手来源；无法核实的信息不要写成事实。'
    : '未启用网页搜索。不要声称掌握今天的新闻，不要虚构链接或时效性事实；优先写常青知识和方法论。'

  return `为“芝士AI吃鱼”生成 ${dateKey} 的一篇中文技术文章草稿。\n\n${topicInstruction}\n${researchInstruction}\n\n写作要求：\n1. 目标读者是想真正理解并落地 AI 的工程师和产品人。\n2. 用人话解释复杂概念，但保留技术精度；给出可执行步骤、边界条件和常见误区。\n3. 文章应有明确观点，不使用“在当今快速发展的时代”等套话，不伪造作者亲历。\n4. 正文约 1400–2200 个中文字符，使用 Markdown 二级/三级标题；不要输出 YAML frontmatter。\n5. 若给出代码，必须是最小可运行片段；若事实需要来源，在正文中放 Markdown 链接。\n6. 只返回一个合法 JSON 对象，不要使用 Markdown 代码围栏。\n\nJSON 结构：\n{"title":"不超过32字","description":"80–120字摘要","slug":"英文小写短横线 slug","tags":["2到5个标签"],"markdown":"完整 Markdown 正文"}`
}

function parseDraft(value) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('内容模型没有返回 JSON 对象。')
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    throw new Error('内容模型返回的草稿 JSON 无法解析。')
  }
}

function validateDraft(draft) {
  if (!draft || typeof draft !== 'object') throw new Error('草稿结构无效。')
  if (typeof draft.title !== 'string' || cleanLine(draft.title).length < 4) throw new Error('草稿标题无效。')
  if (typeof draft.description !== 'string' || cleanLine(draft.description).length < 20) {
    throw new Error('草稿摘要过短。')
  }
  if (!Array.isArray(draft.tags) || draft.tags.length < 2) throw new Error('草稿至少需要两个标签。')
  if (typeof draft.markdown !== 'string' || draft.markdown.trim().length < 800) {
    throw new Error('草稿正文过短，拒绝写入。')
  }
  if (/<script\b/i.test(draft.markdown)) throw new Error('草稿包含不允许的 script 标签。')
}

function normalizeSlug(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 10)
}

function cleanLine(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeMdxBraces(markdown) {
  let inFence = false
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence
        return line
      }
      return inFence ? line : line.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
    })
    .join('\n')
}

function safeError(value) {
  try {
    const parsed = JSON.parse(value)
    return cleanLine(parsed?.error?.message || parsed?.detail || '上游错误').slice(0, 240)
  } catch {
    return cleanLine(value).slice(0, 240)
  }
}

function parseDateKey(value) {
  if (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('CONTENT_DATE 必须是 YYYY-MM-DD。')
    const date = new Date(`${value}T00:00:00+08:00`)
    if (Number.isNaN(date.getTime())) throw new Error('CONTENT_DATE 必须是有效日期。')
    return value
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

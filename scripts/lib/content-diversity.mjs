import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const TOPIC_CATALOG = [
  { id: 'learning-cognitive-friction', cluster: 'learning', prompt: '当答案随手可得，学习为什么仍然需要认知摩擦' },
  { id: 'learning-verification-habits', cluster: 'learning', prompt: 'AI 原生学习者如何建立证据核验习惯，而不是只练提示词' },
  { id: 'learning-memory-value', cluster: 'learning', prompt: '当 AI 可以随时解释，知识记忆还承担什么作用' },
  { id: 'work-junior-training', cluster: 'work', prompt: 'AI 接管初级任务后，职场新人要到哪里获得训练' },
  { id: 'work-judgment-bottleneck', cluster: 'work', prompt: '知识工作的瓶颈从产出速度转向判断责任之后' },
  { id: 'work-management-coordination', cluster: 'work', prompt: '当每个人都有 AI 助手，团队协作为什么可能变得更难' },
  { id: 'creativity-blank-page', cluster: 'creativity', prompt: '创作不再从空白页开始后，原创能力如何形成' },
  { id: 'creativity-taste-selection', cluster: 'creativity', prompt: 'AI 可以生成无数方案，人的审美为什么更像一种删减能力' },
  { id: 'creativity-authorship', cluster: 'creativity', prompt: '人机共同创作里，作者性究竟落在提示、选择还是修改' },
  { id: 'society-ai-companionship', cluster: 'society', prompt: 'AI 陪伴进入日常后，被理解的感觉和真实关系有什么差别' },
  { id: 'society-delegated-decisions', cluster: 'society', prompt: '把越来越多日常决定交给 AI，人如何保留目标感' },
  { id: 'society-shared-reality', cluster: 'society', prompt: '每个人拥有不同 AI 答案后，我们如何维持共同事实' },
  { id: 'product-validation-debt', cluster: 'product', prompt: 'AI 原生创业者获得速度之后，为什么更容易积累验证债务' },
  { id: 'product-feature-or-workflow', cluster: 'product', prompt: '一个 AI 功能什么时候会成为工作流，而不只是演示' },
  { id: 'product-trust-recovery', cluster: 'product', prompt: 'AI 产品答错一次之后，信任应该怎样被设计回来' },
  { id: 'engineering-agent-evaluation', cluster: 'engineering', prompt: 'Agent 能完成演示之后，为什么仍然需要可重复的评测' },
  { id: 'engineering-context-boundary', cluster: 'engineering', prompt: '模型上下文越来越长，系统边界为什么没有因此消失' },
  { id: 'engineering-human-override', cluster: 'engineering', prompt: '自动化系统中的人工接管点应该怎样设置才不流于形式' },
]

const CLUSTER_KEYWORDS = {
  learning: ['学习', '教育', '学生', '知识', '记忆', '认知', '练习', '教师', '学校'],
  work: ['工作', '职场', '员工', '岗位', '职业', '团队', '组织', '协作', '生产力'],
  creativity: ['创作', '原创', '作者', '审美', '表达', '写作', '艺术', '版权'],
  society: ['关系', '陪伴', '孤独', '社会', '共同事实', '日常决定', '目标感', '情感'],
  product: ['产品', '创业', '用户', '功能', '工作流', '商业', '验证', '信任设计'],
  engineering: ['agent', '智能体', '模型', '评测', '上下文', '系统', '自动化', '人工接管', '工程'],
}

export async function loadArticleHistory(postsDir, { beforeDate, limit = 60 } = {}) {
  const files = (await fs.readdir(postsDir)).filter((file) => file.endsWith('.mdx'))
  const articles = []
  for (const file of files) {
    const raw = await fs.readFile(path.join(postsDir, file), 'utf8')
    const article = parseArticle(raw, file)
    if (article.published === false) continue
    if (beforeDate && article.date && article.date.slice(0, 10) >= beforeDate) continue
    articles.push(article)
  }
  return articles
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit)
}

export function parseArticle(raw, filename = '') {
  const match = String(raw).match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  const frontmatter = match ? parseFrontmatter(match[1]) : {}
  const body = match ? match[2] : String(raw)
  const fileSlug = filename.replace(/\.mdx$/i, '')
  return {
    filename,
    slug: cleanScalar(frontmatter.slug) || fileSlug.replace(/^daily-\d{4}-\d{2}-\d{2}-/, ''),
    title: cleanScalar(frontmatter.title),
    description: cleanScalar(frontmatter.description),
    date: cleanScalar(frontmatter.date),
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(cleanScalar).filter(Boolean) : [],
    topicId: cleanScalar(frontmatter.topicId),
    topicCluster: cleanScalar(frontmatter.topicCluster),
    published: frontmatter.published !== false,
    body: body.slice(0, 12000),
  }
}

export function inferTopicCluster(value) {
  const text = normalizeText(typeof value === 'string'
    ? value
    : [value?.title, value?.description, ...(value?.tags || [])].join(' '))
  const scores = Object.entries(CLUSTER_KEYWORDS).map(([cluster, keywords]) => ({
    cluster,
    score: keywords.reduce((total, keyword) => total + countOccurrences(text, normalizeText(keyword)), 0),
  }))
  scores.sort((a, b) => b.score - a.score)
  return scores[0]?.score ? scores[0].cluster : 'general'
}

export function selectTopic(date, history, catalog = TOPIC_CATALOG) {
  if (!catalog.length) throw new Error('选题目录不能为空。')
  const dailyHistory = history.filter((article) => article.filename?.startsWith('daily-'))
  const usedIds = new Set(dailyHistory.map((article) => article.topicId).filter(Boolean))
  const recentClusters = new Set(dailyHistory.slice(0, 2).map((article) => article.topicCluster || inferTopicCluster(article)))
  const recentText = dailyHistory.slice(0, 20).map((article) => `${article.title} ${article.description}`)
  const ranked = catalog.map((topic) => {
    const similarity = Math.max(0, ...recentText.map((text) => textSimilarity(topic.prompt, text, 2)))
    const penalty = (usedIds.has(topic.id) ? 100 : 0) + (recentClusters.has(topic.cluster) ? 12 : 0) + similarity * 50
    const tieBreaker = hashNumber(`${date}:${topic.id}`) / 0xffffffff
    return { topic, score: penalty + tieBreaker }
  }).sort((a, b) => a.score - b.score)
  return ranked[0].topic
}

export function compareArticleCandidate(candidate, history) {
  let strongest = null
  for (const article of history) {
    const title = textSimilarity(candidate.title, article.title, 2)
    const description = textSimilarity(candidate.description, article.description, 2)
    const tags = setSimilarity(candidate.tags, article.tags)
    const body = textSimilarity(candidate.markdown || candidate.body, article.body, 5)
    const sameSlug = Boolean(candidate.slug && article.slug && normalizeSlug(candidate.slug) === normalizeSlug(article.slug))
    const score = title * 0.55 + description * 0.25 + tags * 0.1 + body * 0.1
    const reasons = []
    if (sameSlug) reasons.push('slug 相同')
    if (title >= 0.52) reasons.push(`标题相似度 ${formatScore(title)}`)
    if (title >= 0.32 && tags >= 0.4) reasons.push(`标题与标签共同相似（${formatScore(title)}/${formatScore(tags)}）`)
    if (title >= 0.38 && description >= 0.26) reasons.push(`标题与摘要共同相似（${formatScore(title)}/${formatScore(description)}）`)
    if (score >= 0.42) reasons.push(`综合相似度 ${formatScore(score)}`)
    if (body >= 0.34 && description >= 0.25) reasons.push(`正文与摘要共同相似（${formatScore(body)}/${formatScore(description)}）`)
    const comparison = { article, sameSlug, title, description, tags, body, score, reasons }
    if (!strongest || comparison.score > strongest.score || (sameSlug && !strongest.sameSlug)) strongest = comparison
  }
  return strongest
}

export function assertContentDiversity(candidate, history) {
  const conflict = compareArticleCandidate(candidate, history)
  if (!conflict?.reasons.length) return candidate
  const date = conflict.article.date?.slice(0, 10) || '历史日期'
  throw new Error(`内容与 ${date}《${conflict.article.title || conflict.article.filename}》过于相似：${conflict.reasons.join('；')}。必须更换问题、证据或中心判断，不能只改标题。`)
}

export function textSimilarity(left, right, shingleSize = 2) {
  const a = shingles(normalizeText(left), shingleSize)
  const b = shingles(normalizeText(right), shingleSize)
  return jaccard(a, b)
}

function parseFrontmatter(value) {
  const result = {}
  let listKey = ''
  for (const line of value.split('\n')) {
    const listItem = line.match(/^\s+-\s+(.+)$/)
    if (listItem && listKey) {
      result[listKey].push(parseScalar(listItem[1]))
      continue
    }
    const field = line.match(/^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/)
    if (!field) continue
    listKey = ''
    if (!field[2]) {
      result[field[1]] = []
      listKey = field[1]
    } else {
      result[field[1]] = parseScalar(field[2])
    }
  }
  return result
}

function parseScalar(value) {
  const text = String(value).trim()
  if (text === 'true') return true
  if (text === 'false') return false
  if (text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text) } catch { return text.slice(1, -1) }
  }
  return text.replace(/^['"]|['"]$/g, '')
}

function cleanScalar(value) {
  return typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim() : ''
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]+\]\([^)]*\)/g, '$1')
    .replace(/[`*_>#~|\-]/g, '')
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, '')
}

function shingles(value, size) {
  if (!value) return new Set()
  if (value.length <= size) return new Set([value])
  const output = new Set()
  for (let index = 0; index <= value.length - size; index += 1) output.add(value.slice(index, index + size))
  return output
}

function setSimilarity(left, right) {
  const a = new Set((Array.isArray(left) ? left : []).map(normalizeText).filter(Boolean))
  const b = new Set((Array.isArray(right) ? right : []).map(normalizeText).filter(Boolean))
  return jaccard(a, b)
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection += 1
  return intersection / (a.size + b.size - intersection)
}

function countOccurrences(value, needle) {
  if (!needle) return 0
  let count = 0
  let position = 0
  while ((position = value.indexOf(needle, position)) >= 0) {
    count += 1
    position += needle.length
  }
  return count
}

function normalizeSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

function hashNumber(value) {
  return Number.parseInt(crypto.createHash('sha1').update(value).digest('hex').slice(0, 8), 16)
}

function formatScore(value) {
  return `${Math.round(value * 100)}%`
}

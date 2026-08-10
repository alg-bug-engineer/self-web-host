import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  assertContentDiversity,
  inferTopicCluster,
  loadArticleHistory,
  selectTopic,
} from './lib/content-diversity.mjs'

const projectDir = process.cwd()
const baseUrl = (process.env.CONTENT_AI_BASE_URL || 'http://127.0.0.1:3000/v1').replace(/\/$/, '')
const model = process.env.CONTENT_AI_MODEL?.trim() || 'gpt-5-6'
const dateKey = parseDateKey(process.env.CONTENT_DATE)
const autoPublish = process.env.CONTENT_AUTO_PUBLISH !== 'false'
const runReview = process.env.CONTENT_AI_REVIEW !== 'false'
const webSearch = process.env.CONTENT_WEB_SEARCH === 'true'
const maxRepairAttempts = Math.min(4, Math.max(1, Number.parseInt(process.env.CONTENT_MAX_REPAIR_ATTEMPTS || '3', 10) || 3))
const sourceConfigFile = process.env.CONTENT_AI_CONFIG_FILE?.trim() || path.resolve(projectDir, '..', 'chatgpt2api', 'config.json')
const apiKey = process.env.CONTENT_AI_API_KEY?.trim() || (await readLocalAuthKey(sourceConfigFile))
const postsDir = path.join(projectDir, 'content', 'posts')
const wechatDir = path.join(projectDir, 'content', 'wechat')
const imagesRoot = path.join(projectDir, 'public', 'images', 'articles')
const sourceBanks = {
  learning: [
    { name: 'UNESCO', title: 'Guidance for generative AI in education and research', url: 'https://unesdoc.unesco.org/ark:/48223/pf0000386693', note: '教育与研究场景的治理建议，不等同于学习效果实验。' },
    { name: 'Microsoft Research / CMU', title: 'The Impact of Generative AI on Critical Thinking', url: 'https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/', note: '基于知识工作者自我报告，不能推出永久智力下降。' },
    { name: 'Noy & Zhang, Science', title: 'Experimental Evidence on the Productivity Effects of Generative Artificial Intelligence', url: 'https://www.science.org/doi/10.1126/science.adh2586', note: '研究对象是特定专业写作任务，结论不应泛化到所有认知活动。' },
    { name: 'OECD', title: 'OECD Digital Education Outlook 2023', url: 'https://www.oecd.org/en/publications/oecd-digital-education-outlook-2023_c74f03de-en.html', note: '提供数字教育生态与政策背景。' },
  ],
  work: [
    { name: 'ILO', title: 'Generative AI and Jobs: A Refined Global Index of Occupational Exposure', url: 'https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure', note: '衡量职业任务暴露，不等于预测岗位会被整体替代。' },
    { name: 'Brynjolfsson, Li & Raymond / NBER', title: 'Generative AI at Work', url: 'https://www.nber.org/papers/w31161', note: '研究特定客服场景，生产率差异不能直接推广到所有职业。' },
    { name: 'NBER', title: 'Shifting Work Patterns with Generative AI', url: 'https://www.nber.org/papers/w33795', note: '跨企业现场实验，仍需区分工具使用和组织层面的长期变化。' },
    { name: 'Stanford HAI', title: 'The 2025 AI Index Report', url: 'https://hai.stanford.edu/ai-index/2025-ai-index-report', note: '提供产业与技术趋势背景，不替代具体岗位研究。' },
  ],
  creativity: [
    { name: 'U.S. Copyright Office', title: 'Copyright and Artificial Intelligence, Part 2: Copyrightability', url: 'https://www.copyright.gov/ai/', note: '讨论美国法下人类创作贡献与可版权性，不代表全球统一规则。' },
    { name: 'WIPO', title: 'Generative AI — IP and Frontier Technologies', url: 'https://www.wipo.int/publications/en/details.jsp?id=4750&plang=EN', note: '提供知识产权政策讨论，不是创作质量实验。' },
    { name: 'Noy & Zhang, Science', title: 'Experimental Evidence on the Productivity Effects of Generative Artificial Intelligence', url: 'https://www.science.org/doi/10.1126/science.adh2586', note: '只支持特定专业写作任务中的短期表现结论。' },
    { name: 'UNESCO', title: 'Recommendation on the Ethics of Artificial Intelligence', url: 'https://www.unesco.org/en/articles/recommendation-ethics-artificial-intelligence', note: '提供文化、多样性与人类监督的规范框架。' },
  ],
  society: [
    { name: 'WHO', title: 'From loneliness to social connection: charting a path to healthier societies', url: 'https://www.who.int/publications/i/item/978240112360', note: '报告讨论人际社会连接，不能直接证明 AI 陪伴的因果影响。' },
    { name: 'UNESCO', title: 'Recommendation on the Ethics of Artificial Intelligence', url: 'https://www.unesco.org/en/articles/recommendation-ethics-artificial-intelligence', note: '提供人权、尊严、透明与人类监督的规范背景。' },
    { name: 'NIST', title: 'Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile', url: 'https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence', note: '是风险管理框架，不是社会效果测量。' },
    { name: 'OpenAI', title: 'How people are using ChatGPT', url: 'https://openai.com/index/how-people-are-using-chatgpt/', note: '描述产品使用模式，不代表关系质量或长期福祉。' },
  ],
  product: [
    { name: 'NIST', title: 'Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile', url: 'https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence', note: '用于设计风险管理过程，不是产品成功清单。' },
    { name: 'Stanford HAI', title: 'The 2025 AI Index Report', url: 'https://hai.stanford.edu/ai-index/2025-ai-index-report', note: '提供采用率、成本和产业趋势背景。' },
    { name: 'Brynjolfsson, Li & Raymond / NBER', title: 'Generative AI at Work', url: 'https://www.nber.org/papers/w31161', note: '说明特定工作流中的异质效果，不代表所有 AI 功能都产生价值。' },
    { name: 'OpenAI', title: 'How people are using ChatGPT', url: 'https://openai.com/index/how-people-are-using-chatgpt/', note: '用于观察真实任务分布，不直接证明留存和商业价值。' },
  ],
  engineering: [
    { name: 'NIST', title: 'Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile', url: 'https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence', note: '提供生成式 AI 风险分类与管理动作。' },
    { name: 'Stanford HAI', title: 'The 2025 AI Index Report', url: 'https://hai.stanford.edu/ai-index/2025-ai-index-report', note: '汇总技术评测趋势，也明确复杂推理仍有边界。' },
    { name: 'UNESCO', title: 'Recommendation on the Ethics of Artificial Intelligence', url: 'https://www.unesco.org/en/articles/recommendation-ethics-artificial-intelligence', note: '提供人类监督和责任边界的规范背景。' },
    { name: 'OpenAI', title: 'How people are using ChatGPT', url: 'https://openai.com/index/how-people-are-using-chatgpt/', note: '真实使用模式只能作为系统设计背景。' },
  ],
}
const styleProfile = [
  '开头从读者熟悉的真实行为变化切入，用短段落逐步提出问题，不用宏大背景开场。',
  '章节按“日常现场—可靠证据—变化机制—隐藏代价—反例与边界—人的选择”推进，而不是罗列几项能力。',
  '允许一句话单独成段，长短句交替；判断之前先白描事实，不追求整齐排比和金句。',
  '产品名和具体任务只在确有分析价值时出现，不虚构作者见闻、学生故事或采访。',
  '结尾收束到一个具体而未被彻底解决的问题，不写口号式展望。',
].join('\n')

if (!apiKey) throw new Error('未找到 CONTENT_AI_API_KEY 或本机 chatgpt2api auth-key。')

await fs.mkdir(postsDir, { recursive: true })
const existing = await fs.readdir(postsDir)
if (existing.some((file) => file.startsWith(`daily-${dateKey}-`) && file.endsWith('.mdx'))) {
  console.log(`${dateKey} 已有深度文章，跳过重复生成。`)
  process.exit(0)
}

const articleHistory = await loadArticleHistory(postsDir, { beforeDate: dateKey, limit: 60 })
const manualTopic = process.env.CONTENT_TOPIC?.trim()
const topicPlan = manualTopic
  ? {
      id: `manual-${crypto.createHash('sha1').update(manualTopic).digest('hex').slice(0, 10)}`,
      cluster: inferTopicCluster(manualTopic),
      prompt: manualTopic,
    }
  : selectTopic(dateKey, articleHistory)
const sourceBank = sourceBanks[topicPlan.cluster] || sourceBanks.engineering
const recentHistory = formatHistoryForPrompt(articleHistory)
const draft = await ensureValidDraft(
  await requestJson(buildWriterPrompt(topicPlan, sourceBank, recentHistory)),
  '初稿',
  articleHistory,
)
const finalDraft = runReview
  ? await ensureValidDraft(
      await requestJson(buildReviewerPrompt(draft, recentHistory), '你是严格但克制的中文主编，只输出合法 JSON。'),
      '主编审校稿',
      articleHistory,
    )
  : draft

const slug = normalizeSlug(finalDraft.slug || finalDraft.title)
assertContentDiversity({ ...finalDraft, slug }, articleHistory)
const articleImageDir = path.join(imagesRoot, `${dateKey}-${slug}`)
const imagePublicDir = `/images/articles/${dateKey}-${slug}`
await fs.mkdir(articleImageDir, { recursive: true })
await fs.mkdir(wechatDir, { recursive: true })

const figureLinks = []
for (const [index, figure] of finalDraft.figures.entries()) {
  const filename = `figure-${String(index + 1).padStart(2, '0')}.png`
  const outputPath = path.join(articleImageDir, filename)
  await sharp(Buffer.from(renderFigureSvg(figure, index))).png({ quality: 92 }).toFile(outputPath)
  figureLinks.push({
    afterSection: figure.afterSection,
    markdown: `![${cleanLine(figure.title)}](${imagePublicDir}/${filename})\n\n*${cleanLine(figure.caption)}*`,
    localPath: path.relative(projectDir, outputPath),
  })
}

const coverPath = path.join(articleImageDir, 'cover.png')
await sharp(Buffer.from(renderCoverSvg(finalDraft))).png({ quality: 92 }).toFile(coverPath)

const markdownWithFigures = insertFigures(finalDraft.markdown.trim(), figureLinks)
const sourcesMarkdown = finalDraft.sources
  .map((source) => `- [${cleanLine(source.name)}：${cleanLine(source.title)}](${source.url})${source.note ? ` — ${cleanLine(source.note)}` : ''}`)
  .join('\n')
const body = `${markdownWithFigures}\n\n## 主要资料与延伸阅读\n\n${sourcesMarkdown}`
const publishedAt = `${dateKey}T08:30:00+08:00`
const postFilename = `daily-${dateKey}-${slug}.mdx`
const postPath = path.join(postsDir, postFilename)
const baseTags = topicPlan.cluster === 'learning' ? ['AI原生一代', 'AI深度观察', 'AI'] : ['AI深度观察', 'AI']
const tags = [...new Set([...baseTags, ...finalDraft.tags.map(cleanLine)])].slice(0, 7)
const frontmatter = [
  '---',
  `title: ${JSON.stringify(cleanLine(finalDraft.title))}`,
  `description: ${JSON.stringify(cleanLine(finalDraft.description))}`,
  `date: ${publishedAt}`,
  'author: 芝士AI吃鱼',
  'tags:',
  ...tags.map((tag) => `  - ${JSON.stringify(tag)}`),
  'icon: robot',
  `published: ${autoPublish}`,
  `cover: ${JSON.stringify(`${imagePublicDir}/cover.png`)}`,
  `topicId: ${JSON.stringify(topicPlan.id)}`,
  `topicCluster: ${JSON.stringify(topicPlan.cluster)}`,
  '---',
  '',
].join('\n')
await fs.writeFile(postPath, `${frontmatter}\n${escapeMdxBraces(body)}\n`, { encoding: 'utf8', flag: 'wx' })

const htmlFilename = `daily-${dateKey}-${slug}.html`
const htmlPath = path.join(wechatDir, htmlFilename)
await fs.writeFile(htmlPath, renderWechatHtml(finalDraft, body, figureLinks), 'utf8')

const manifest = {
  version: 2,
  date: dateKey,
  slug,
  title: cleanLine(finalDraft.title),
  description: cleanLine(finalDraft.description),
  topicId: topicPlan.id,
  topicCluster: topicPlan.cluster,
  postPath: path.relative(projectDir, postPath),
  htmlPath: path.relative(projectDir, htmlPath),
  coverPath: path.relative(projectDir, coverPath),
  figurePaths: figureLinks.map((figure) => figure.localPath),
  websiteUrl: `https://ai-knowledgepoints.cn/blog/daily-${dateKey}-${slug}`,
}
await fs.writeFile(path.join(wechatDir, `daily-${dateKey}-${slug}.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`已生成${autoPublish ? '可发布' : '待审核'}深度文章：${manifest.postPath}`)
console.log(`公众号发布稿：${manifest.htmlPath}`)

async function requestModel(userPrompt, systemPrompt = '你是“芝士AI吃鱼”的中文深度内容编辑。你尊重事实、保留作者判断和人的呼吸，不编造经历、数据、引语或来源。只输出合法 JSON。') {
  const payload = {
    model,
    stream: false,
    max_tokens: 12000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
  }
  if (webSearch) payload.tools = [{ type: 'web_search' }]
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(420_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`内容模型请求失败：HTTP ${response.status} ${safeError(text)}`)
  const envelope = JSON.parse(text)
  const content = envelope?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有返回文章内容。')
  return content
}

async function requestJson(prompt, systemPrompt) {
  let lastError
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const content = await requestModel(
      attempt === 1 ? prompt : `${prompt}\n\n上一次输出不是合法 JSON。不要解释，不要使用代码围栏，只返回一个完整 JSON 对象。`,
      systemPrompt,
    )
    try {
      return parseJson(content)
    } catch (error) {
      lastError = error
      console.log(`结构化响应解析失败，准备第 ${attempt + 1} 次尝试。`)
    }
  }
  throw lastError
}

async function ensureValidDraft(candidate, stage, history) {
  let current = candidate
  const failureHistory = []
  for (let attempt = 0; attempt <= maxRepairAttempts; attempt += 1) {
    current.sources = mergeSources(current.sources)
    try {
      const validated = validateDraft(current)
      assertContentDiversity(validated, history)
      return validated
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      failureHistory.push(reason)
      if (attempt === maxRepairAttempts) {
        throw new Error(`${stage}经过 ${maxRepairAttempts} 轮定向返工仍未通过质检：${reason}`)
      }
      console.log(`${stage}未通过质检，正在进行第 ${attempt + 1}/${maxRepairAttempts} 轮定向返工：${reason}`)
      current = await requestJson(
        `下面的${stage}没有通过结构化质检。

本轮必须修复：${reason}
此前失败记录：${failureHistory.join('；')}

只修复明确问题，并在输出前逐项自检所有结构化规则，避免修好一个问题又引入另一个问题。保留可靠论证和来源；不要缩短正文；全文保持 3500–5500 个中文字符。若问题涉及模板句式，请直接重写相关段落，不要只替换连接词。

待返工内容：
${JSON.stringify(current)}

结构：
${draftSchema()}`,
        '你是“芝士AI吃鱼”的返工编辑。按质检失败原因做定向修订，保留事实边界和自然表达；返回前完整自检。只输出合法 JSON。',
      )
    }
  }

  throw new Error(`${stage}返工流程异常结束。`)
}

function buildWriterPrompt(topic, sources, history) {
  return `围绕“${topic.prompt}”写一篇面向公众号和个人网站的中文深度文章。主题簇是 ${topic.cluster}，主题标识是 ${topic.id}。参考所给范文的内容方法，但不要复刻句子、标题或论证顺序。\n\n最近已经发布的文章如下，它们是禁写清单：不得换标题复述相同中心判断，也不得沿用相同章节骨架。\n${history}\n\n可用的一手资料池（sources 至少保留 4 项）：${JSON.stringify(sources)}\n\n表达与推进方式：\n${styleProfile}\n\n写作位置：作者是有算法工程和 AI 内容创作经验的观察者；只写可以核实的事实，不虚构亲历、采访和情绪场景。\n\n文章方法：\n1. 从一个读者熟悉的具体变化切入，再追问变化背后的能力、制度或代价。\n2. 必须有一个可争辩的中心判断，不做“AI 有利有弊”的空泛综述。\n3. 使用真实研究、官方报告或一手产品资料；精确数字必须有来源链接，研究结论要写清样本和边界。\n4. 正文 3500–5500 个中文字符，6–9 个二级标题；段落长短有呼吸，不用整齐排比堆金句。\n5. 不写“在这个日新月异的时代”“赋能”“重塑未来”等套话，不凭空增加凌晨、咖啡馆等场景。\n6. 先白描事实，再给判断；保留必要的犹豫、反问和限定，不装成全知口吻。\n7. 正文不包含一级标题、YAML、资料列表或配图 Markdown。\n8. slug 必须准确描述本期问题，不得复用禁写清单中的 slug 或仅添加日期。\n\n配图方法：输出 4 张信息图规格。图不是装饰，分别承担数据对照、过程变化、分析框架或风险边界；每张 3–6 个项目，文字短、可独立读懂。afterSection 是放在第几个二级章节标题之后，取 1–6 且不重复。\n\n只返回一个 JSON：\n${draftSchema()}`
}

function buildReviewerPrompt(draft, history) {
  return `下面是一篇 AI 深度文章草稿。请做一次克制的主编审校，并返回同结构完整 JSON。\n\n最近已经发布的文章如下。审校不得把草稿改回这些文章的中心判断、标题表达或章节骨架：\n${history}\n\n审校重点：\n- 删除无来源的精确数字、伪引语、虚构亲历和过度外推。\n- 核对来源 URL 是否为可靠的一手资料；不可靠就删掉相关断言和来源。\n- 中心判断必须清楚，但承认反例、样本边界和不确定性。\n- 去掉 AI 腔、工整排比和硬造金句；优先白描、短句和自然转折，不凭空添加生活场景。\n- 正文保持 3500–5500 个中文字符、6–9 个二级标题；保留 4 张真正帮助理解的信息图。\n- 主动检查与历史文章的标题、摘要、正文和标签是否过近；相似时必须更换问题、证据或中心判断，不得只换词。\n- 不要改变 JSON 字段，不要输出审校说明。\n\n草稿：\n${JSON.stringify(draft)}\n\n结构：\n${draftSchema()}`
}

function draftSchema() {
  return `{"title":"12–34字","description":"70–140字摘要","slug":"英文小写短横线","kicker":"简短英文栏目名","deck":"80–180字导语","thesis":"一句中心判断","tags":["3–5个标签"],"metrics":[{"label":"指标名","value":"值","note":"口径或边界"}],"markdown":"完整 Markdown 正文","figures":[{"afterSection":1,"kind":"cards|flow|comparison|matrix|bars","title":"图标题","subtitle":"一句解释","items":[{"label":"短标签","value":"值或关键词","note":"一句说明"}],"caption":"来源或分析边界"}],"sources":[{"name":"机构或作者","title":"资料标题","url":"https://可靠一手来源","note":"资料边界"}]}`
}

function validateDraft(value) {
  if (!value || typeof value !== 'object') throw new Error('文章 JSON 结构无效。')
  if (cleanLine(value.title).length < 8 || cleanLine(value.title).length > 42) throw new Error('标题长度不合格。')
  if (cleanLine(value.description).length < 40 || cleanLine(value.description).length > 180) throw new Error('摘要长度不合格。')
  if (typeof value.markdown !== 'string' || value.markdown.length < 2400 || value.markdown.length > 16000) throw new Error(`正文长度不合格（当前 ${String(value.markdown || '').length} 字符，要求 2400–16000）。`)
  const headings = value.markdown.match(/^##\s+.+$/gm) || []
  if (headings.length < 6 || headings.length > 10) throw new Error('正文需要 6–10 个二级标题。')
  if (/^#\s+/m.test(value.markdown) || /^---$/m.test(value.markdown) || /<script\b/i.test(value.markdown)) throw new Error('正文包含不允许的结构。')
  const formulaicTransitions = (value.markdown.match(/(?:首先是|其次是|第三是|第四是|第一点|第二点|第三点)/g) || []).length
  if (formulaicTransitions >= 3) throw new Error('正文使用了模板化的顺序罗列，请改成由场景、证据和因果推动的自然章节。')
  const falseDepthPatterns = (value.markdown.match(/(?:不是[^。\n]{0,55}而是|重要的不是[^。\n]{0,55}而是)/g) || []).length
  if (falseDepthPatterns >= 3) throw new Error('正文反复使用“不是 X，而是 Y”的假深刻句式，请改为直接陈述具体判断。')
  if (!Array.isArray(value.metrics) || value.metrics.length !== 3) throw new Error('必须提供 3 个封面指标。')
  if (!Array.isArray(value.figures) || value.figures.length !== 4) throw new Error('必须提供 4 张信息图。')
  const positions = new Set()
  for (const figure of value.figures) {
    if (!Number.isInteger(figure.afterSection) || figure.afterSection < 1 || figure.afterSection > headings.length) throw new Error('信息图章节位置无效。')
    if (positions.has(figure.afterSection)) throw new Error('信息图章节位置不能重复。')
    positions.add(figure.afterSection)
    if (!Array.isArray(figure.items) || figure.items.length < 3 || figure.items.length > 6) throw new Error('每张信息图需要 3–6 个项目。')
  }
  if (!Array.isArray(value.sources) || value.sources.length < 4) throw new Error('至少需要 4 个可靠来源。')
  for (const source of value.sources) {
    if (!/^https:\/\//i.test(source.url || '')) throw new Error('来源必须使用 HTTPS 链接。')
  }
  if (!Array.isArray(value.tags) || value.tags.length < 2) throw new Error('至少需要两个标签。')
  return value
}

function insertFigures(markdown, figures) {
  const bySection = new Map(figures.map((figure) => [figure.afterSection, figure.markdown]))
  let section = 0
  const output = []
  for (const line of markdown.split('\n')) {
    output.push(line)
    if (/^##\s+/.test(line)) {
      section += 1
      if (bySection.has(section)) output.push('', bySection.get(section), '')
    }
  }
  return output.join('\n').replace(/\n{3,}/g, '\n\n')
}

function renderFigureSvg(figure, index) {
  const items = figure.items.slice(0, 6)
  const columns = items.length <= 3 ? items.length : 3
  const rows = Math.ceil(items.length / columns)
  const gap = 22
  const startX = 70
  const startY = 225
  const width = (1060 - gap * (columns - 1)) / columns
  const height = rows === 1 ? 300 : 168
  const cards = items.map((item, itemIndex) => {
    const col = itemIndex % columns
    const row = Math.floor(itemIndex / columns)
    const x = startX + col * (width + gap)
    const y = startY + row * (height + gap)
    const label = svgTextLines(cleanLine(item.label), x + 24, y + 38, 16, 16, '#6B7C93', 19)
    const value = svgTextLines(cleanLine(item.value), x + 24, y + 88, 28, 19, '#102A43', 34, 2, 700)
    const note = svgTextLines(cleanLine(item.note), x + 24, y + (rows === 1 ? 158 : 126), 17, 23, '#52667F', 32, rows === 1 ? 4 : 2)
    return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="#F7F9FC" stroke="#DDE5EF"/><rect x="${x}" y="${y}" width="5" height="${height}" rx="2.5" fill="${index % 2 ? '#4D7EA8' : '#2F6FA5'}"/>${label}${value}${note}</g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#FFFFFF"/><rect x="0" width="1200" height="10" fill="#102A43"/><text x="70" y="70" font-family="Arial,sans-serif" font-size="15" font-weight="700" letter-spacing="2" fill="#2F6FA5">FIGURE ${String(index + 1).padStart(2, '0')} · ${escapeXml(String(figure.kind || 'ANALYSIS').toUpperCase())}</text>${svgTextLines(cleanLine(figure.title),70,123,31,26,'#102A43',42,2,750)}${svgTextLines(cleanLine(figure.subtitle),70,190,17,42,'#687A90',23,2)}${cards}<text x="70" y="647" font-family="Arial,sans-serif" font-size="13" fill="#8291A5">${escapeXml(truncate(cleanLine(figure.caption), 92))}</text></svg>`
}

function renderCoverSvg(draft) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="383" viewBox="0 0 900 383"><rect width="900" height="383" fill="#102A43"/><circle cx="815" cy="-5" r="210" fill="#1C4565"/><circle cx="815" cy="-5" r="145" fill="none" stroke="#5B88AB" stroke-opacity=".38" stroke-width="2"/><text x="62" y="62" font-family="Arial,sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="#78A7CC">${escapeXml(cleanLine(draft.kicker || 'AI NATIVE GENERATION'))}</text>${svgTextLines(cleanLine(draft.title),62,132,43,19,'#FFFFFF',55,3,760)}<rect x="62" y="319" width="68" height="5" rx="2.5" fill="#5EA2D4"/><text x="148" y="329" font-family="Arial,sans-serif" font-size="16" fill="#BFD1E0">芝士AI吃鱼 · 深度观察</text></svg>`
}

function renderWechatHtml(draft, markdown, figures) {
  const articleHtml = markdownToHtml(markdown, figures)
  const metrics = draft.metrics.map((metric) => `<div class="metric"><div class="metric-label">${escapeHtml(cleanLine(metric.label))}</div><div class="metric-number">${escapeHtml(cleanLine(metric.value))}</div><div class="metric-note">${escapeHtml(cleanLine(metric.note))}</div></div>`).join('')
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(cleanLine(draft.title))}｜公众号发布版</title><style>:root{--navy:#102A43;--blue:#2F6FA5;--ink:#273A57;--muted:#6B7C93;--line:#DDE5EF;--soft:#F3F7FB}*{box-sizing:border-box}body{margin:0;background:#ECEFF3;color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",Arial,sans-serif}.page{max-width:960px;margin:28px auto;background:#fff;box-shadow:0 18px 44px rgba(16,31,55,.1)}article{padding:64px 88px 86px}.cover{padding-bottom:42px;border-bottom:1px solid var(--line);margin-bottom:42px}.kicker{font-size:12px;letter-spacing:2px;font-weight:700;color:var(--blue)}h1{font-size:46px;line-height:1.24;color:var(--navy);margin:14px 0 0}.deck{font-size:18px;line-height:1.9;color:#4F6078;margin-top:20px}.metric-strip{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);margin-top:28px}.metric{padding:18px;border-right:1px solid var(--line)}.metric:last-child{border-right:0}.metric-label{font-size:12px;color:var(--muted)}.metric-number{font-family:Georgia,serif;font-size:30px;font-weight:700;color:var(--navy);margin-top:8px}.metric-note{font-size:11px;line-height:1.6;color:#7B8799;margin-top:6px}h2{font-size:27px;line-height:1.5;margin:56px 0 24px;color:var(--navy)}h2:before{content:"";display:block;width:38px;height:4px;background:var(--blue);margin-bottom:13px}h3{font-size:20px;line-height:1.6;margin:30px 0 14px;color:var(--navy)}p{font-size:17px;line-height:2;color:#273A57;margin:0 0 19px}strong{color:#0F2747}blockquote{margin:0 0 30px;padding:19px 23px;border-left:5px solid var(--blue);background:var(--soft);font-size:18px;line-height:1.9}figure{margin:34px 0 46px;border-top:2px solid var(--navy);padding-top:16px}figure img{display:block;width:100%;height:auto;border:1px solid #E8EDF3}figcaption{font-size:11.5px;line-height:1.65;color:#8793A5;margin-top:9px}ul,ol{padding-left:24px}li{font-size:16px;line-height:1.9;margin-bottom:7px}a{color:#2F6FA5}hr{border:0;height:1px;background:#E5EAF0;margin:46px 0}@media(max-width:900px){.page{margin:0;box-shadow:none}article{padding:42px 25px 65px}h1{font-size:37px}.metric-strip{grid-template-columns:1fr}.metric{border-right:0;border-bottom:1px solid var(--line)}}</style></head><body><main class="page"><article><header class="cover"><div class="kicker">${escapeHtml(cleanLine(draft.kicker))}</div><h1>${escapeHtml(cleanLine(draft.title))}</h1><div class="deck">${escapeHtml(cleanLine(draft.deck))}</div><div class="metric-strip">${metrics}</div></header><blockquote>${escapeHtml(cleanLine(draft.thesis))}</blockquote>${articleHtml}</article></main></body></html>`
}

function markdownToHtml(markdown, figures) {
  const localByUrl = new Map(figures.map((figure) => [`/${figure.localPath.replace(/^public\//, '')}`, figure.localPath]))
  const lines = markdown.split('\n')
  const output = []
  let paragraph = []
  let listType = null
  const flushParagraph = () => {
    if (paragraph.length) output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (listType) output.push(`</${listType}>`)
    listType = null
  }
  for (const line of lines) {
    if (!line.trim()) { flushParagraph(); closeList(); continue }
    const heading = line.match(/^##\s+(.+)/)
    if (heading) { flushParagraph(); closeList(); output.push(`<h2>${inlineMarkdown(heading[1])}</h2>`); continue }
    const subheading = line.match(/^###\s+(.+)/)
    if (subheading) { flushParagraph(); closeList(); output.push(`<h3>${inlineMarkdown(subheading[1])}</h3>`); continue }
    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (image) {
      flushParagraph(); closeList()
      const local = localByUrl.get(image[2]) || `public${image[2]}`
      output.push(`<figure><img src="https://ai-knowledgepoints.cn${escapeHtml(image[2])}" data-local-src="${escapeHtml(local)}" alt="${escapeHtml(image[1])}">`)
      continue
    }
    if (/^\*[^*].*\*$/.test(line) && output.at(-1)?.startsWith('<figure>')) {
      output[output.length - 1] += `<figcaption>${inlineMarkdown(line.slice(1, -1))}</figcaption></figure>`
      continue
    }
    if (/^>\s+/.test(line)) { flushParagraph(); closeList(); output.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s+/, ''))}</blockquote>`); continue }
    if (/^---+$/.test(line)) { flushParagraph(); closeList(); output.push('<hr>'); continue }
    const bullet = line.match(/^[-*]\s+(.+)/)
    const numbered = line.match(/^\d+[.)]\s+(.+)/)
    if (bullet || numbered) {
      flushParagraph()
      const nextType = bullet ? 'ul' : 'ol'
      if (listType !== nextType) { closeList(); listType = nextType; output.push(`<${listType}>`) }
      output.push(`<li>${inlineMarkdown((bullet || numbered)[1])}</li>`)
      continue
    }
    paragraph.push(line.trim())
  }
  flushParagraph(); closeList()
  return output.join('')
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function svgTextLines(value, x, y, fontSize, maxChars, color, lineHeight, maxLines = 2, weight = 400) {
  const lines = wrapText(value, maxChars).slice(0, maxLines)
  return `<text x="${x}" y="${y}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${color}">${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(index === maxLines - 1 && wrapText(value, maxChars).length > maxLines ? `${truncate(line, Math.max(2, maxChars - 1))}…` : line)}</tspan>`).join('')}</text>`
}

function wrapText(value, size) {
  const chars = [...String(value || '')]
  const lines = []
  while (chars.length) lines.push(chars.splice(0, size).join(''))
  return lines.length ? lines : ['']
}

function mergeSources(sources) {
  const merged = [...(Array.isArray(sources) ? sources : []), ...sourceBank]
  return [...new Map(
    merged
      .filter((source) => /^https:\/\//i.test(source?.url || ''))
      .map((source) => [source.url, source]),
  ).values()].slice(0, 8)
}

function formatHistoryForPrompt(history) {
  const recent = history.filter((article) => article.title).slice(0, 12)
  if (!recent.length) return '- 暂无历史文章。'
  return recent.map((article) => {
    const date = article.date?.slice(0, 10) || '未知日期'
    const description = cleanLine(article.description).slice(0, 120)
    return `- ${date}《${cleanLine(article.title)}》；slug=${article.slug}；摘要=${description}`
  }).join('\n')
}

async function readLocalAuthKey(file) {
  try {
    const config = JSON.parse(await fs.readFile(file, 'utf8'))
    return String(config['auth-key'] || '').trim()
  } catch {
    return ''
  }
}

function parseJson(value) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型没有返回 JSON 对象。')
  try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { throw new Error('模型返回的文章 JSON 无法解析。') }
}

function normalizeSlug(value) {
  const normalized = String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return normalized || crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 10)
}

function escapeMdxBraces(markdown) {
  let inFence = false
  return markdown.split('\n').map((line) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return line }
    return inFence ? line : line.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
  }).join('\n')
}

function cleanLine(value) { return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() }
function truncate(value, length) { return [...String(value || '')].slice(0, length).join('') }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') }
function escapeXml(value) { return escapeHtml(value).replace(/'/g, '&apos;') }
function safeError(value) { try { const parsed = JSON.parse(value); return cleanLine(parsed?.error?.message || parsed?.detail || '上游错误').slice(0, 240) } catch { return cleanLine(value).slice(0, 240) } }

function parseDateKey(value) {
  if (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00+08:00`))) throw new Error('CONTENT_DATE 必须是有效的 YYYY-MM-DD。')
    return value
  }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

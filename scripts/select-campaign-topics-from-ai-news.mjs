import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const dateKey = args.date || shanghaiDateKey()
const asOf = args.asOf ? new Date(args.asOf) : new Date()
if (!Number.isFinite(asOf.getTime())) throw new Error('--as-of 必须是有效 ISO 8601 时间。')
const config = await readJson(args.config || 'ops/campaigns/ai-native-generation-30d-topic-radar.json')
const campaign = await readJson(args.campaign || 'ops/campaigns/ai-native-generation-30d.json')
validateConfig(config, campaign)
await validateVerifiedCandidateAssets(config)

const day = campaign.days.find((item) => item.date === dateKey) || null
const feed = args.file
  ? await readJson(args.file)
  : await fetchFeed(args.feedUrl || config.feedUrl)
validateFeed(feed)

const feedFreshness = evaluateFeedFreshness(feed.generated_at, asOf, config.maxFeedAgeHours)
const candidates = day && feedFreshness.status === 'fresh'
  ? selectCandidates(feed.items, config, day.week, args.limit)
  : []
const report = {
  campaignId: campaign.id,
  asOf: dateKey,
  inCampaign: day !== null,
  week: day?.week || null,
  campaignTopic: day?.articleTopic || null,
  feedUrl: args.file ? null : (args.feedUrl || config.feedUrl),
  feedGeneratedAt: feed.generated_at || null,
  feedFreshness,
  feedItems: feed.items.length,
  feedIsEvidence: false,
  candidates,
  guardrails: config.guardrails,
  externalWritesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))

function parseArgs(values) {
  const parsed = { asOf: '', campaign: '', config: '', date: '', feedUrl: '', file: '', json: false, limit: 0 }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--campaign') parsed.campaign = values[++index] || ''
    else if (value === '--config') parsed.config = values[++index] || ''
    else if (value === '--date') parsed.date = values[++index] || ''
    else if (value === '--feed-url') parsed.feedUrl = values[++index] || ''
    else if (value === '--file') parsed.file = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--limit') parsed.limit = Number(values[++index] || 0)
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) throw new Error('--date 必须是 YYYY-MM-DD。')
  if (parsed.limit && (!Number.isInteger(parsed.limit) || parsed.limit < 1 || parsed.limit > 30)) {
    throw new Error('--limit 必须是 1—30 的整数。')
  }
  return parsed
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(path.resolve(projectDir, filename), 'utf8'))
}

async function fetchFeed(url) {
  if (!/^https:\/\//i.test(url || '')) throw new Error('AI news feed 必须使用 HTTPS。')
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ai-knowledgepoints-campaign-topic-radar/1.0' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`AI news feed 请求失败：HTTP ${response.status}`)
  return response.json()
}

function validateConfig(value, campaign) {
  if (!value || value.version !== 1) throw new Error('选题雷达配置版本无效。')
  if (value.campaignId !== campaign.id) throw new Error('选题雷达 campaignId 不匹配。')
  if (value.role !== 'discovery_only') throw new Error('选题雷达必须保持 discovery_only。')
  if (!/^https:\/\//i.test(value.feedUrl || '')) throw new Error('选题雷达 feedUrl 必须使用 HTTPS。')
  if (!Number.isFinite(value.maxFeedAgeHours) || value.maxFeedAgeHours < 24 || value.maxFeedAgeHours > 168) {
    throw new Error('选题雷达 maxFeedAgeHours 必须是 24—168 小时。')
  }
  for (const key of ['aiContextSignals', 'audienceGateSignals', 'childStageSignals', 'adultEducationExclusions', 'sensitiveChildSafetySignals', 'globalSignals', 'clickbaitPenalties', 'possiblePrimaryDomains', 'guardrails']) {
    if (!Array.isArray(value[key]) || value[key].length === 0) throw new Error(`选题雷达 ${key} 不能为空。`)
  }
  for (const week of ['1', '2', '3', '4']) {
    if (!Array.isArray(value.weekSignals?.[week]) || value.weekSignals[week].length === 0) {
      throw new Error(`选题雷达 weekSignals.${week} 不能为空。`)
    }
  }
  if (!Array.isArray(value.verifiedCandidates)) throw new Error('选题雷达 verifiedCandidates 必须是数组。')
  const verifiedIds = new Set()
  for (const candidate of value.verifiedCandidates) {
    if (!candidate.id || verifiedIds.has(candidate.id)) throw new Error('选题雷达 verifiedCandidates id 缺失或重复。')
    verifiedIds.add(candidate.id)
    if (!Array.isArray(candidate.discoveryUrls) || !candidate.discoveryUrls.length
      || candidate.discoveryUrls.some((url) => !/^https:\/\//.test(url))) {
      throw new Error(`${candidate.id} discoveryUrls 无效。`)
    }
    if (!/^https:\/\//.test(candidate.primarySourceUrl || '')) throw new Error(`${candidate.id} primarySourceUrl 无效。`)
    if (!candidate.primaryTitle || !candidate.evidenceAsset?.endsWith('.md')) throw new Error(`${candidate.id} 原始来源元数据不完整。`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.verifiedAt || '')) throw new Error(`${candidate.id} verifiedAt 无效。`)
    if (candidate.evidenceStatus !== 'primary_verified_with_limits') throw new Error(`${candidate.id} evidenceStatus 无效。`)
    if (!Array.isArray(candidate.scopeLimits) || candidate.scopeLimits.length < 3 || !candidate.recommendedUse) {
      throw new Error(`${candidate.id} 范围限制或使用建议不完整。`)
    }
  }
}

async function validateVerifiedCandidateAssets(config) {
  for (const candidate of config.verifiedCandidates || []) {
    const filename = path.resolve(projectDir, candidate.evidenceAsset)
    const text = await fs.readFile(filename, 'utf8').catch(() => '')
    if (!text) throw new Error(`${candidate.id} 缺少证据文件 ${candidate.evidenceAsset}。`)
    if (!text.includes(candidate.primarySourceUrl) || !text.includes(candidate.evidenceStatus)) {
      throw new Error(`${candidate.id} 证据文件未绑定原始来源或核验状态。`)
    }
  }
}

function validateFeed(value) {
  if (!value || !Array.isArray(value.items)) throw new Error('AI news feed 缺少 items。')
  if (value.items.length > 20_000) throw new Error('AI news feed 项目数异常，拒绝处理。')
}

function evaluateFeedFreshness(generatedAt, asOf, maxAgeHours) {
  const generated = new Date(generatedAt || '')
  if (!Number.isFinite(generated.getTime())) {
    return {
      status: 'unknown',
      ageHours: null,
      maxAgeHours,
      candidateSelectionAllowed: false,
      reason: '聚合源未提供有效生成时间；不使用候选，继续固定活动周历。',
    }
  }
  const ageHours = (asOf.getTime() - generated.getTime()) / 3_600_000
  if (ageHours < -1) {
    return {
      status: 'future_timestamp',
      ageHours: roundHours(ageHours),
      maxAgeHours,
      candidateSelectionAllowed: false,
      reason: '聚合源生成时间晚于核验时间；不使用候选，等待时间或源元数据复核。',
    }
  }
  if (ageHours > maxAgeHours) {
    return {
      status: 'stale',
      ageHours: roundHours(ageHours),
      maxAgeHours,
      candidateSelectionAllowed: false,
      reason: `聚合源已超过 ${maxAgeHours} 小时新鲜度门禁；不使用候选，继续固定活动周历。`,
    }
  }
  return {
    status: 'fresh',
    ageHours: roundHours(Math.max(0, ageHours)),
    maxAgeHours,
    candidateSelectionAllowed: true,
    reason: '聚合源生成时间在新鲜度门禁内；候选仍只作发现，采用前必须回到一手来源。',
  }
}

function roundHours(value) {
  return Math.round(value * 100) / 100
}

function selectCandidates(items, config, week, explicitLimit) {
  const signals = [...config.globalSignals, ...(config.weekSignals?.[String(week)] || [])]
  const scored = items
    .map((item) => scoreItem(item, signals, config))
    .filter((item) => item && item.score >= config.minimumScore)
    .sort((left, right) => right.score - left.score
      || Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0)
      || left.title.localeCompare(right.title, 'zh-CN'))

  const limit = explicitLimit || config.maxCandidates
  const selected = []
  const hosts = new Map()
  const urls = new Set()
  const verifiedTopicIds = new Set()
  for (const item of scored) {
    if (urls.has(item.url)) continue
    if (item.verifiedTopicId && verifiedTopicIds.has(item.verifiedTopicId)) continue
    const count = hosts.get(item.host) || 0
    if (count >= config.maxPerHost) continue
    selected.push(item)
    urls.add(item.url)
    if (item.verifiedTopicId) verifiedTopicIds.add(item.verifiedTopicId)
    hosts.set(item.host, count + 1)
    if (selected.length >= limit) break
  }
  return selected
}

function scoreItem(item, signals, config) {
  const title = cleanLine(item?.title_zh || item?.title || item?.title_original)
  const url = String(item?.url || '').trim()
  if (title.length < 4 || !/^https:\/\//i.test(url)) return null
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const lower = title.toLocaleLowerCase('zh-CN')
  const aiContextSignals = config.aiContextSignals
    .filter((signal) => lower.includes(String(signal).toLocaleLowerCase('zh-CN')))
  if (aiContextSignals.length === 0) return null
  const audienceGateSignals = config.audienceGateSignals
    .filter((signal) => lower.includes(String(signal).toLocaleLowerCase('zh-CN')))
  if (audienceGateSignals.length === 0) return null
  const childStageSignals = config.childStageSignals
    .filter((signal) => lower.includes(String(signal).toLocaleLowerCase('zh-CN')))
  const adultEducationSignals = config.adultEducationExclusions
    .filter((signal) => lower.includes(String(signal).toLocaleLowerCase('zh-CN')))
  if (adultEducationSignals.length > 0 && childStageSignals.length === 0) return null
  const sensitiveChildSafetySignals = config.sensitiveChildSafetySignals
    .filter((signal) => lower.includes(String(signal).toLocaleLowerCase('zh-CN')))
  const matchedSignals = signals.filter((signal) => lower.includes(String(signal.term).toLocaleLowerCase('zh-CN')))
  if (matchedSignals.length === 0) return null
  const penaltySignals = config.clickbaitPenalties
    .filter((signal) => lower.includes(String(signal.term).toLocaleLowerCase('zh-CN')))
  const possiblePrimarySource = config.possiblePrimaryDomains.some(
    (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`),
  )
  const verifiedCandidate = (config.verifiedCandidates || []).find((candidate) =>
    candidate.discoveryUrls.includes(url)
  ) || null
  const score = matchedSignals.reduce((sum, signal) => sum + signal.weight, 0)
    + penaltySignals.reduce((sum, signal) => sum + signal.weight, 0)
    + (possiblePrimarySource || verifiedCandidate ? 3 : 0)

  return {
    title,
    url,
    host: parsed.hostname,
    source: cleanLine(item.source || item.site_name || item.site_id || '未标注'),
    publishedAt: item.published_at || item.first_seen_at || null,
    score,
    aiContextSignals,
    audienceGateSignals,
    childStageSignals,
    adultEducationSignals,
    sensitiveChildSafetySignals,
    matchedSignals: matchedSignals.map((signal) => signal.term),
    penaltySignals: penaltySignals.map((signal) => signal.term),
    evidenceStatus: verifiedCandidate?.evidenceStatus
      || (possiblePrimarySource ? 'possible_primary_source_needs_opening' : 'discovery_only'),
    primaryVerificationRequired: !verifiedCandidate,
    verifiedTopicId: verifiedCandidate?.id || null,
    primarySourceUrl: verifiedCandidate?.primarySourceUrl || null,
    primaryTitle: verifiedCandidate?.primaryTitle || null,
    evidenceAsset: verifiedCandidate?.evidenceAsset || null,
    verifiedAt: verifiedCandidate?.verifiedAt || null,
    scopeLimits: verifiedCandidate?.scopeLimits || [],
    recommendedUse: verifiedCandidate?.recommendedUse || null,
    draftEligibility: verifiedCandidate
      ? 'bounded_support_only'
      : (sensitiveChildSafetySignals.length ? 'research_only_no_public_draft' : 'primary_verification_required'),
  }
}

function renderMarkdown(report) {
  const lines = [
    '# AI 原生一代选题雷达',
    '',
    `- 日期：${report.asOf}`,
    `- 活动周期内：${report.inCampaign ? '是' : '否'}`,
    `- 周次：${report.week == null ? '不适用' : `第 ${report.week} 周`}`,
    `- 聚合数据生成时间：${report.feedGeneratedAt || '未标注'}`,
    `- 聚合源新鲜度：${report.feedFreshness.status}（${report.feedFreshness.ageHours == null ? '未知' : `${report.feedFreshness.ageHours} 小时`} / 门禁 ${report.feedFreshness.maxAgeHours} 小时）`,
    `- 新鲜度动作：${report.feedFreshness.reason}`,
    `- 聚合条目：${report.feedItems}`,
    '- 证据属性：只作发现，不是事实证据',
    '- 外部写入：无',
    '',
  ]
  if (report.campaignTopic) lines.push('## 当天主选题（不可被雷达覆盖）', '', report.campaignTopic, '')
  lines.push('## 候选角度', '')
  if (!report.candidates.length) lines.push('- 暂无达到阈值的候选；继续执行活动周历，不为追热点降低标准。')
  else {
    for (const [index, item] of report.candidates.entries()) {
      lines.push(
        `${index + 1}. [${item.title}](${item.url})`,
        `   - 来源标签：${item.source}｜分数：${item.score}｜状态：${item.evidenceStatus}｜草稿资格：${item.draftEligibility}`,
        `   - AI 语境：${item.aiContextSignals.join('、')}｜受众语境：${item.audienceGateSignals.join('、')}｜能力命中：${item.matchedSignals.join('、')}${item.penaltySignals.length ? `｜标题风险：${item.penaltySignals.join('、')}` : ''}`,
        ...(item.primarySourceUrl ? [
          `   - 已核验原始来源：[${item.primaryTitle}](${item.primarySourceUrl})｜证据文件：${item.evidenceAsset}`,
          `   - 使用边界：${item.scopeLimits.join('；')}`,
          `   - 建议：${item.recommendedUse}`,
        ] : []),
      )
    }
  }
  lines.push('', '## 使用门禁', '', ...report.guardrails.map((item) => `- ${item}`), '')
  return `${lines.join('\n')}\n`
}

function cleanLine(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const calendarFile = args.file
  ? path.resolve(projectDir, args.file)
  : await resolveCalendarFile(args.date)
const trackingFile = path.resolve(
  projectDir,
  args.tracking || 'ops/campaigns/ai-native-generation-30d-tracking-links.json',
)
const [calendar, tracking] = await Promise.all([
  fs.readFile(calendarFile, 'utf8').then(JSON.parse),
  fs.readFile(trackingFile, 'utf8').then(JSON.parse),
])
validateCalendar(calendar)

const knownStatuses = new Set(Object.keys(calendar.statusDefinitions))
const ids = new Set()
const slots = new Set()
const missingAssets = []
const invalidEntries = []
const xDraftChecks = []
const wechatDraftChecks = []
const longformDraftChecks = []
const directPayloadChecks = []
const childDataSafetyChecks = []
const mediaAttachmentChecks = []
const courseBetaBoundaryChecks = []
const heldTrackingLinks = []
const externalPlatforms = new Set(['wechat', 'csdn', 'x', 'toutiao', 'zsxq'])

for (const entry of calendar.entries) {
  const xHasPublishPayload = entry.platform === 'x'
    && (entry.assets || []).some((asset) => asset.endsWith('-publish.txt'))
  if (ids.has(entry.id)) invalidEntries.push(`${entry.id}：id 重复`)
  ids.add(entry.id)
  const slot = `${entry.date}:${entry.platform}:${entry.id}`
  if (slots.has(slot)) invalidEntries.push(`${entry.id}：排期槽重复`)
  slots.add(slot)
  if (entry.date < calendar.period.startsOn || entry.date > calendar.period.endsOn) {
    invalidEntries.push(`${entry.id}：日期不在周历范围内`)
  }
  if (!calendar.cadenceTargets[entry.platform]) invalidEntries.push(`${entry.id}：未知平台 ${entry.platform}`)
  if (!knownStatuses.has(entry.status)) invalidEntries.push(`${entry.id}：未知状态 ${entry.status}`)
  if (!Array.isArray(entry.assets) || entry.assets.length === 0) invalidEntries.push(`${entry.id}：缺少素材路径`)
  for (const asset of entry.assets || []) {
    const assetFile = path.resolve(projectDir, asset)
    const stat = await fs.stat(assetFile).catch(() => null)
    if (!stat?.isFile()) missingAssets.push(`${entry.id}:${asset}`)
    let publishText = null
    if (stat?.isFile() && (asset.endsWith('.md') || asset.endsWith('.txt'))) {
      publishText = await fs.readFile(assetFile, 'utf8')
    }
    if (
      publishText
      && tracking.status !== 'active'
      && externalPlatforms.has(entry.platform)
      && publishText.includes(tracking.destination)
    ) {
      heldTrackingLinks.push({ id: entry.id, platform: entry.platform, asset, destination: tracking.destination })
      invalidEntries.push(`${entry.id}：课程页渠道为 ${tracking.status}，外发稿不得包含 ${tracking.destination}`)
    }
    const shouldAuditXAsset = entry.platform === 'x' && stat?.isFile()
      && ((xHasPublishPayload && asset.endsWith('-publish.txt')) || (!xHasPublishPayload && asset.endsWith('.md')))
    if (shouldAuditXAsset) {
      const candidates = asset.endsWith('.txt')
        ? [{ variant: '发布载荷', body: publishText.trim() }]
        : extractXPostCandidates(publishText)
      if (candidates.length === 0) invalidEntries.push(`${entry.id}：X 素材没有可发布正文`)
      for (const candidate of candidates) {
        const weightedLength = xWeightedLength(candidate.body)
        xDraftChecks.push({
          id: entry.id,
          asset,
          variant: candidate.variant,
          weightedLength,
          limit: 280,
        })
        if (weightedLength > 280) {
          invalidEntries.push(`${entry.id}：X ${candidate.variant} 加权长度 ${weightedLength} 超过 280`)
        }
      }
    }
  }
  if (entry.mediaAttachment) {
    const media = entry.mediaAttachment
    const validStatus = new Set(['local_ready', 'published', 'blocked']).has(media.status)
    const referencedAssets = [media.videoAsset, media.successPublishAsset, media.fallbackPublishAsset, media.accessibilityCheckAsset].filter(Boolean)
    const assetsIncluded = referencedAssets.every((asset) => (entry.assets || []).includes(asset))
    const successText = media.successPublishAsset
      ? await fs.readFile(path.resolve(projectDir, media.successPublishAsset), 'utf8').catch(() => '')
      : ''
    const hasSyntheticDisclosure = /生成式视觉.*合成配音.*不代表真实儿童.*课程效果/s.test(successText)
    const fallbackText = media.fallbackPublishAsset
      ? await fs.readFile(path.resolve(projectDir, media.fallbackPublishAsset), 'utf8').catch(() => '')
      : ''
    const fallbackClaimsVideo = /视频含|视频已|观看视频|附.*视频/.test(fallbackText)
    const accessibilityText = media.accessibilityCheckAsset
      ? await fs.readFile(path.resolve(projectDir, media.accessibilityCheckAsset), 'utf8').catch(() => '')
      : ''
    const accessibilityBounded = /无声可理解性：通过（有限）/.test(accessibilityText)
      && /硬字幕：无/.test(accessibilityText)
      && /mov_text/.test(accessibilityText)
      && /同帖正文/.test(accessibilityText)
    const successHasTopic = Boolean(media.topicMarker && successText.includes(media.topicMarker))
    const fallbackHasTopic = Boolean(media.topicMarker && fallbackText.includes(media.topicMarker))
    mediaAttachmentChecks.push({
      id: entry.id,
      platform: entry.platform,
      status: media.status,
      mediaType: media.mediaType,
      videoAsset: media.videoAsset,
      successPublishAsset: media.successPublishAsset,
      fallbackPublishAsset: media.fallbackPublishAsset,
      topicMarker: media.topicMarker,
      assetsIncluded,
      hasSyntheticDisclosure,
      fallbackClaimsVideo,
      successHasTopic,
      fallbackHasTopic,
      hardSubtitles: media.hardSubtitles,
      muteFallbackStatus: media.muteFallbackStatus,
      accessibilityCheckAsset: media.accessibilityCheckAsset,
      accessibilityBounded,
    })
    if (!['x', 'toutiao', 'zsxq'].includes(entry.platform)) invalidEntries.push(`${entry.id}：平台不支持当前媒体附件流程`)
    if (!validStatus) invalidEntries.push(`${entry.id}：mediaAttachment 状态无效`)
    if (!assetsIncluded) invalidEntries.push(`${entry.id}：mediaAttachment 引用的素材未全部列入 assets`)
    if (!media.videoAsset?.endsWith('.mp4')) invalidEntries.push(`${entry.id}：mediaAttachment 缺少 MP4`)
    if (!media.successPublishAsset?.endsWith('-publish.txt')) invalidEntries.push(`${entry.id}：媒体成功载荷无效`)
    if (!media.fallbackPublishAsset?.endsWith('-publish.txt')) invalidEntries.push(`${entry.id}：媒体回退载荷无效`)
    if (!media.topicMarker) invalidEntries.push(`${entry.id}：mediaAttachment 缺少同题标记`)
    if (!successHasTopic) invalidEntries.push(`${entry.id}：媒体成功载荷与周历主题不一致`)
    if (!fallbackHasTopic) invalidEntries.push(`${entry.id}：媒体回退载荷与周历主题不一致`)
    if (!hasSyntheticDisclosure) invalidEntries.push(`${entry.id}：媒体成功载荷缺少生成式视觉与合成配音声明`)
    if (fallbackClaimsVideo) invalidEntries.push(`${entry.id}：媒体回退载荷不得声称附有视频`)
    if (media.hardSubtitles !== false) invalidEntries.push(`${entry.id}：硬字幕状态必须与实际媒体一致`)
    if (media.muteFallbackStatus !== 'key_points_only') invalidEntries.push(`${entry.id}：无声回退状态必须保持有限口径`)
    if (!media.accessibilityCheckAsset || !accessibilityBounded) invalidEntries.push(`${entry.id}：缺少有限无声可理解性验收`)
  }
  if (entry.platform === 'wechat' && entry.assets?.[0]) {
    const asset = entry.assets[0]
    const assetFile = path.resolve(projectDir, asset)
    const publishText = await fs.readFile(assetFile, 'utf8').catch(() => '')
    const h1 = publishText.match(/^# (.+)$/m)?.[1]?.trim() || ''
    const internalMarkers = [
      ...publishText.matchAll(/^## (标题|建议标题|摘要|正文|发布设置|后台设置|配图建议)$/gm),
      ...publishText.matchAll(/^(?:- )?(建议发布时间|备选标题)[：:]/gm),
    ].map((match) => match[0])
    const hasDisclosure = /生成式[^\n]*不代表真实学员或课程效果/.test(publishText)
    const missingAuthorityEvidence = findMissingAuthorityEvidence(publishText)
    const ctaIntents = findWechatCtaIntents(publishText, tracking.destination)
    wechatDraftChecks.push({
      id: entry.id,
      asset,
      calendarTitle: entry.title,
      h1,
      titleMatches: h1 === entry.title,
      internalMarkers,
      hasDisclosure,
      missingAuthorityEvidence,
      ctaIntents,
    })
    if (h1 !== entry.title) invalidEntries.push(`${entry.id}：公众号正文 H1 与周历标题不一致`)
    if (internalMarkers.length) invalidEntries.push(`${entry.id}：公众号正文含内部发布字段 ${internalMarkers.join('、')}`)
    if (!hasDisclosure) invalidEntries.push(`${entry.id}：公众号正文缺少生成式配图声明`)
    if (missingAuthorityEvidence.length) {
      invalidEntries.push(`${entry.id}：公众号引用 ${missingAuthorityEvidence.join('、')} 但缺少对应原始链接`)
    }
    if (ctaIntents.length > 1) invalidEntries.push(`${entry.id}：公众号结尾存在多个主动作 ${ctaIntents.join('、')}`)
  }
  if (['csdn', 'toutiao'].includes(entry.platform) && entry.assets?.[0]) {
    const asset = entry.assets[0]
    const assetFile = path.resolve(projectDir, asset)
    const publishText = await fs.readFile(assetFile, 'utf8').catch(() => '')
    const h1 = publishText.match(/^# (.+)$/m)?.[1]?.trim() || ''
    const internalMarkers = [
      ...publishText.matchAll(/^## (标题|建议标题|摘要|正文|发布设置|后台设置|发布核验|运营动作|配图建议)$/gm),
      ...publishText.matchAll(/^(?:- )?(计划发布时间|建议发布时间|备选标题|发布后记录)[：:]/gm),
    ].map((match) => match[0])
    const missingAuthorityEvidence = findMissingAuthorityEvidence(publishText)
    longformDraftChecks.push({
      id: entry.id,
      platform: entry.platform,
      asset,
      calendarTitle: entry.title,
      h1,
      titleMatches: h1 === entry.title,
      internalMarkers,
      missingAuthorityEvidence,
    })
    if (h1 !== entry.title) invalidEntries.push(`${entry.id}：${entry.platform} 正文 H1 与周历标题不一致`)
    if (internalMarkers.length) invalidEntries.push(`${entry.id}：${entry.platform} 正文含内部发布字段 ${internalMarkers.join('、')}`)
    if (missingAuthorityEvidence.length) {
      invalidEntries.push(`${entry.id}：${entry.platform} 引用 ${missingAuthorityEvidence.join('、')} 但缺少对应原始链接`)
    }
  }
  if (['x', 'zsxq'].includes(entry.platform)) {
    const pureAsset = (entry.assets || []).find((asset) => asset.endsWith('-publish.txt')) || null
    const sourceAsset = (entry.assets || []).find((asset) => asset.endsWith('.md')) || null
    const sourceText = sourceAsset
      ? await fs.readFile(path.resolve(projectDir, sourceAsset), 'utf8').catch(() => '')
      : ''
    const requiresMetricsDecision = /^## (有有效|有阅读|无有效|公开复盘稿|下一周决策)/m.test(sourceText)
    const publishText = pureAsset
      ? await fs.readFile(path.resolve(projectDir, pureAsset), 'utf8').catch(() => '')
      : ''
    const forbidden = /建议发布时间|可选首评|发布核验|回复模板|激活指标|后台设置|运营动作|`(?:qualifiedGuardianInterests|paidPilotFamilies|courseStartedFamilies|courseCompletedFamilies)`|^## (星主|记录指标|指标|后台|运营|计数口径|计量口径|付款门禁|有效.*口径|完成口径|公开授权|发布设置)/m
    const zsxqTitle = entry.platform === 'zsxq' ? publishText.split('\n')[0]?.trim() || '' : null
    const titleMatches = entry.platform !== 'zsxq' || zsxqTitle === entry.title
    const hasInternalMarkers = forbidden.test(publishText)
    const asksForFamilyContribution = entry.platform === 'zsxq'
      && detectsFamilyContributionRequest(publishText)
    const hasChildDataBoundary = entry.platform !== 'zsxq' || !asksForFamilyContribution || (
      /(?:不要|不需|无需|不得|不收集|不保存|不粘贴|不上传|不提交)[^。\n]{0,140}(?:儿童资料|儿童身份|姓名|学校|住址|位置|正脸|声音|聊天|账号|联系方式|原始(?:作品|作业|材料|记录)|真实(?:聊天|材料|照片|作品)|家庭材料)/.test(publishText)
      || (/虚构情境/.test(publishText) && /不粘贴真实/.test(publishText))
    )
    if (entry.platform === 'zsxq' && pureAsset) {
      childDataSafetyChecks.push({
        id: entry.id,
        asset: pureAsset,
        asksForFamilyContribution,
        hasChildDataBoundary,
        ready: hasChildDataBoundary,
      })
    }
    directPayloadChecks.push({
      id: entry.id,
      platform: entry.platform,
      pureAsset,
      ready: Boolean(pureAsset && publishText.trim() && titleMatches && !hasInternalMarkers && hasChildDataBoundary),
      requiresMetricsDecision,
      titleMatches,
      hasInternalMarkers,
    })
    if (!pureAsset && !requiresMetricsDecision) invalidEntries.push(`${entry.id}：缺少 -publish.txt 且母稿不是数据分支`)
    if (pureAsset && !publishText.trim()) invalidEntries.push(`${entry.id}：纯发布载荷为空`)
    if (pureAsset && !titleMatches) invalidEntries.push(`${entry.id}：知识星球纯载荷标题与周历标题不一致`)
    if (pureAsset && hasInternalMarkers) invalidEntries.push(`${entry.id}：纯发布载荷仍含内部字段`)
    if (pureAsset && asksForFamilyContribution && !hasChildDataBoundary) {
      invalidEntries.push(`${entry.id}：知识星球征集任务缺少儿童数据最小化提示`)
    }
  }
  const courseBetaSource = (entry.assets || []).some((asset) =>
    /2026-08-31-(?:course-beta-recruitment|wechat-course-beta-intake|x-course-beta)/.test(asset)
  )
  if (courseBetaSource) {
    const boundaryAsset = (entry.assets || []).find((asset) =>
      asset.endsWith('2026-08-31-course-beta-participation-boundaries.md')
    ) || null
    const boundaryText = boundaryAsset
      ? await fs.readFile(path.resolve(projectDir, boundaryAsset), 'utf8').catch(() => '')
      : ''
    const requiredBoundaries = {
      intakeOnly: /当前只登记意向，不收费/.test(boundaryText),
      childCanStop: /孩子不愿继续某个任务时，可以停止/.test(boundaryText),
      noAutomaticPublicReuse: /不自动授权公开复用/.test(boundaryText),
      highRiskExclusion: /不提供医疗、心理、法律、财务或人身安全建议/.test(boundaryText),
      futurePaidContract: /完整合同、退款和支付安排/.test(boundaryText),
      sourceLinks: /unesco\.org/.test(boundaryText) && /unicef\.org/.test(boundaryText),
    }
    const ready = Boolean(boundaryAsset && Object.values(requiredBoundaries).every(Boolean))
    courseBetaBoundaryChecks.push({
      id: entry.id,
      platform: entry.platform,
      boundaryAsset,
      requiredBoundaries,
      ready,
    })
    if (!boundaryAsset) invalidEntries.push(`${entry.id}：课程内测承接缺少监护人参与与退出边界`)
    else if (!ready) invalidEntries.push(`${entry.id}：课程内测参与与退出边界不完整`)
  }
  if (entry.status === 'blocked' && !entry.blocker) invalidEntries.push(`${entry.id}：blocked 状态缺少 blocker`)
  if (entry.status === 'scheduled') {
    if (!entry.scheduledFor || Number.isNaN(Date.parse(entry.scheduledFor))) {
      invalidEntries.push(`${entry.id}：scheduled 状态缺少有效 scheduledFor`)
    }
    if (!entry.externalId) invalidEntries.push(`${entry.id}：scheduled 状态缺少 externalId`)
  }
  if (entry.status === 'published' && !entry.externalUrl) {
    invalidEntries.push(`${entry.id}：published 状态缺少 externalUrl`)
  }
}

const readyStatuses = new Set(['published', 'scheduled', 'draft_ready', 'media_ready'])
const platforms = Object.entries(calendar.cadenceTargets).map(([platform, target]) => {
  const entries = calendar.entries.filter((entry) => entry.platform === platform)
  const ready = entries.filter((entry) => readyStatuses.has(entry.status)).length
  const published = entries.filter((entry) => entry.status === 'published').length
  const scheduled = entries.filter((entry) => entry.status === 'scheduled').length
  const blocked = entries.filter((entry) => entry.status === 'blocked').length
  const gap = Math.max(0, target.minimum - ready)
  return {
    platform,
    label: target.label,
    minimum: target.minimum,
    maximum: target.maximum ?? null,
    planned: entries.length,
    ready,
    published,
    scheduled,
    blocked,
    gap,
  }
})
const blockedEntries = calendar.entries.filter((entry) => entry.status === 'blocked')

const report = {
  campaignId: calendar.campaignId,
  period: calendar.period,
  state: invalidEntries.length || missingAssets.length || blockedEntries.length || platforms.some((item) => item.gap > 0)
    ? 'blocked'
    : 'ready',
  entries: calendar.entries.length,
  platforms,
  missingAssets,
  invalidEntries,
  xDraftChecks,
  wechatDraftChecks,
  longformDraftChecks,
  directPayloadChecks,
  childDataSafetyChecks,
  mediaAttachmentChecks,
  courseBetaBoundaryChecks,
  trackingStatus: tracking.status,
  heldTrackingLinks,
  blockers: blockedEntries
    .map((entry) => ({ id: entry.id, platform: entry.platform, blocker: entry.blocker })),
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))
if (args.expectReady && report.state !== 'ready') process.exitCode = 1

function validateCalendar(value) {
  if (!value || value.version !== 1) throw new Error('内容周历版本必须为 1。')
  if (value.campaignId !== 'ai-native-generation-30d') throw new Error('内容周历 campaignId 不匹配。')
  if (!value.period?.startsOn || !value.period?.endsOn) throw new Error('内容周历缺少 period。')
  if (!value.cadenceTargets || typeof value.cadenceTargets !== 'object') throw new Error('内容周历缺少 cadenceTargets。')
  if (!value.statusDefinitions || typeof value.statusDefinitions !== 'object') throw new Error('内容周历缺少 statusDefinitions。')
  if (!Array.isArray(value.entries)) throw new Error('内容周历 entries 必须是数组。')
}

function extractXPostCandidates(markdown) {
  const value = markdown.trim()
  const sections = value
    .split(/\n(?=## )/)
    .filter((part) => part.startsWith('## '))
    .map((part) => {
      const firstBreak = part.indexOf('\n')
      return {
        variant: part.slice(3, firstBreak).trim(),
        body: part.slice(firstBreak + 1).trim(),
      }
    })
  const main = sections.filter((item) => item.variant === '主帖')
  if (main.length) return main
  const platformSection = sections.filter((item) => item.variant === 'X')
  if (platformSection.length) return platformSection
  const alternatives = sections.filter((item) => /有有效|无有效|有阅读/.test(item.variant))
  if (alternatives.length) return alternatives
  const body = value.replace(/^# .+\n\n?/, '').trim()
  return body ? [{ variant: '正文', body }] : []
}

function detectsFamilyContributionRequest(text) {
  const requestPatterns = [
    /有效回复[^。\n]{0,80}(?:需要|只需|格式|内容)/,
    /(?:请|只(?:需|要)?|愿意时|完成后|现在)[^。\n]{0,160}(?:回复|提交|发送|私信)/,
    /(?:请|只(?:需|要)?|愿意时)[^。\n]{0,160}完成[^。\n]{0,160}[。；]\s*[^。\n]{0,60}(?:回复|提交|发送|私信)/,
    /^(?:已完成[^。\n]{0,80}家庭，)?(?:请)?提交(?:一|每|以下|去标识化|文字|本次|三|五)/m,
    /(?:评论区|本帖下)[^。\n]{0,80}(?:格式|回复|提交|写下|贴出|交)/,
    /^## (?:提交|回复|登记|登记方式|参与方式)$/m,
  ]
  return requestPatterns.some((pattern) => pattern.test(text))
}

function xWeightedLength(value) {
  const urls = [...value.matchAll(/https?:\/\/\S+/g)].length
  const withoutUrls = value.replace(/https?:\/\/\S+/g, '')
  let length = urls * 23
  for (const character of [...withoutUrls]) {
    length += /[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/u.test(character) ? 2 : 1
  }
  return length
}

function findMissingAuthorityEvidence(value) {
  const authorities = [
    { label: 'UNESCO', mention: /UNESCO|联合国教科文组织/, link: /https?:\/\/(?:[^/]+\.)?unesco\.org|https?:\/\/unesdoc\.unesco\.org/ },
    { label: 'UNICEF', mention: /UNICEF|联合国儿童基金会/, link: /https?:\/\/(?:[^/]+\.)?unicef\.org/ },
    { label: 'NIST', mention: /\bNIST\b|美国国家标准与技术研究院/, link: /https?:\/\/(?:[^/]+\.)?nist\.gov/ },
    { label: 'WHO', mention: /\bWHO\b|世界卫生组织/, link: /https?:\/\/(?:[^/]+\.)?who\.int/ },
    { label: 'OECD', mention: /\bOECD\b|经济合作与发展组织/, link: /https?:\/\/(?:[^/]+\.)?oecd\.org/ },
    { label: '国家网信办', mention: /国家网信办|人工智能生成合成内容标识办法/, link: /https?:\/\/(?:[^/]+\.)?cac\.gov\.cn/ },
    { label: '国家法律法规数据库', mention: /个人信息保护法|著作权法/, link: /https?:\/\/(?:[^/]+\.)?(?:npc\.gov\.cn|flk\.npc\.gov\.cn)/ },
    { label: '教育部', mention: /教育部等|教育部发布|中小学人工智能通识教育指南/, link: /https?:\/\/(?:[^/]+\.)?(?:moe\.gov\.cn|gov\.cn)/ },
  ]
  return authorities
    .filter((item) => item.mention.test(value) && !item.link.test(value))
    .map((item) => item.label)
}

function findWechatCtaIntents(value, trackingDestination) {
  const headings = [...value.matchAll(/^## (?:结尾 CTA|文末 CTA|CTA)$/gm)]
  const section = headings.length ? value.slice(headings.at(-1).index) : value.slice(-2400)
  const intents = []
  if (/知识星球[^。\n]{0,40}(?:正在进行|将开放|本周提供|只收)|放在知识星球/.test(section)) intents.push('knowledge_planet')
  if (/(?:私信|回复(?:关键词)?)[^。\n]{0,40}儿童AI内测/.test(section)) intents.push('course_beta_intake')
  if (/立即(?:购买|付费)|支付链接|扫码支付/.test(section)) intents.push('payment')
  if (trackingDestination && section.includes(trackingDestination)) intents.push('course_website')
  return [...new Set(intents)]
}

function parseArgs(values) {
  const parsed = { date: '', expectReady: false, file: '', json: false, tracking: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--expect-ready') parsed.expectReady = true
    else if (value === '--date') parsed.date = values[++index] || ''
    else if (value === '--file') parsed.file = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--tracking') parsed.tracking = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) throw new Error('--date 必须是 YYYY-MM-DD。')
  return parsed
}

async function resolveCalendarFile(date) {
  if (!date) {
    return path.join(projectDir, 'ops', 'campaigns', 'ai-native-generation-30d-week1-content-calendar.json')
  }
  const directory = path.join(projectDir, 'ops', 'campaigns')
  const names = (await fs.readdir(directory))
    .filter((name) => /^ai-native-generation-30d-week\d+-content-calendar\.json$/.test(name))
    .sort()
  for (const name of names) {
    const filename = path.join(directory, name)
    const candidate = JSON.parse(await fs.readFile(filename, 'utf8'))
    if (date >= candidate.period?.startsOn && date <= candidate.period?.endsOn) return filename
  }
  throw new Error(`${date} 没有对应的内容周历。`)
}

function renderMarkdown(report) {
  const lines = [
    '# AI 原生一代内容周历审计',
    '',
    `- 周期：${report.period.startsOn} → ${report.period.endsOn}`,
    `- 状态：${report.state}`,
    `- 内容条目：${report.entries}`,
    '',
    '| 平台 | 最低节奏 | 已规划 | 稿件/媒体就绪 | 已定时 | 已发布 | 阻断 | 缺口 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...report.platforms.map((item) =>
      `| ${item.platform} | ${item.minimum} | ${item.planned} | ${item.ready} | ${item.scheduled} | ${item.published} | ${item.blocked} | ${item.gap} |`,
    ),
    '',
    '## 阻断项',
    '',
    ...(report.blockers.length
      ? report.blockers.map((item) => `- ${item.platform}/${item.id}：${item.blocker}`)
      : ['- 无']),
    '',
    `- 缺失素材：${report.missingAssets.length}`,
    `- 无效条目：${report.invalidEntries.length}`,
    `- X 草稿候选：${report.xDraftChecks.length}（最大加权长度 ${report.xDraftChecks.length ? Math.max(...report.xDraftChecks.map((item) => item.weightedLength)) : 0} / 280）`,
    `- 公众号纯正文：${report.wechatDraftChecks.filter((item) => item.titleMatches && item.internalMarkers.length === 0 && item.hasDisclosure).length} / ${report.wechatDraftChecks.length} 通过标题、内部字段和配图声明检查`,
    `- CSDN/今日头条纯正文：${report.longformDraftChecks.filter((item) => item.titleMatches && item.internalMarkers.length === 0).length} / ${report.longformDraftChecks.length} 通过标题与内部字段检查`,
    `- X/知识星球纯载荷：${report.directPayloadChecks.filter((item) => item.ready).length} / ${report.directPayloadChecks.length} 就绪；真实数据分支待选择 ${report.directPayloadChecks.filter((item) => !item.ready && item.requiresMetricsDecision).length}`,
    `- 知识星球儿童数据边界：${report.childDataSafetyChecks.filter((item) => item.ready).length} / ${report.childDataSafetyChecks.length} 通过；只对公开纯载荷中的家庭征集动作执行检查`,
    `- 课程内测参与与退出边界：${report.courseBetaBoundaryChecks.filter((item) => item.ready).length} / ${report.courseBetaBoundaryChecks.length} 通过`,
    `- 课程页渠道：${report.trackingStatus}；违规外发链接：${report.heldTrackingLinks.length}`,
    '',
    '> “就绪”只表示本地稿件、媒体或平台定时状态已核验，不等于已经发布。',
    '',
  ]
  return `${lines.join('\n')}\n`
}

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const deliveryFile = path.resolve(
  projectDir,
  args.file || 'ops/campaigns/ai-native-generation-30d-course-delivery.json',
)
const delivery = JSON.parse(await fs.readFile(deliveryFile, 'utf8'))
const calendars = await loadCalendars()
const calendarEntries = calendars.flatMap((calendar) => calendar.entries || [])

const invalidEntries = []
const missingAssets = []
const lessonIds = new Set()
const companionIds = new Set()
const allowedStatuses = new Set(Object.keys(delivery.statusDefinitions || {}))
const allowedWorksheetStatuses = new Set(Object.keys(delivery.worksheetStatusDefinitions || {}))
let totalVideoBytes = 0
let ageScaffoldingGuide = null
let evidenceMap = null
let worksheet = null
const fallbackPayloadChecks = []

if (delivery.version !== 1) invalidEntries.push('交付清单版本必须为 1')
if (delivery.campaignId !== 'ai-native-generation-30d') invalidEntries.push('campaignId 不匹配')
if (!Array.isArray(delivery.lessons)) invalidEntries.push('lessons 必须为数组')
if (delivery.deliveryPolicy?.mediaType !== 'public_preview') invalidEntries.push('交付媒体必须标记为 public_preview')
if (!/不计 courseStartedFamilies.*courseCompletedFamilies/.test(delivery.deliveryPolicy?.metricRule || '')) {
  invalidEntries.push('缺少试听播放不计课程开始/完成的指标规则')
}
if (!/公开试听.*生成式视觉.*合成配音.*不代表真实儿童.*课程效果/.test(
  delivery.deliveryPolicy?.successDisclosure || '',
)) {
  invalidEntries.push('视频上传成功声明缺少生成式视觉、合成配音与非真实效果边界')
}
if (!/家庭本地练习卡.*可选附件.*无需提交整张卡.*附件上传失败不阻断/.test(
  delivery.deliveryPolicy?.worksheetPolicy || '',
)) {
  invalidEntries.push('练习卡策略缺少本地使用、可选附件或失败不阻断边界')
}

const guideAsset = delivery.deliveryPolicy?.ageScaffoldingGuide
if (typeof guideAsset !== 'string' || !guideAsset.endsWith('.md')) {
  invalidEntries.push('缺少 ageScaffoldingGuide')
} else {
  const guideFile = path.resolve(projectDir, guideAsset)
  const guideText = await fs.readFile(guideFile, 'utf8').catch(() => '')
  if (!guideText) missingAssets.push(`ageScaffoldingGuide:${guideAsset}`)
  else {
    const missingLessonSections = Array.from({ length: 12 }, (_, index) => `L${String(index + 1).padStart(2, '0')}`)
      .filter((lessonId) => !new RegExp(`^## ${lessonId}\\b`, 'm').test(guideText))
    const missingAgeBands = ['8—10', '11—12', '13—14'].filter((band) => !guideText.includes(band))
    if (missingLessonSections.length) invalidEntries.push(`分龄指南缺少课节：${missingLessonSections.join('、')}`)
    if (missingAgeBands.length) invalidEntries.push(`分龄指南缺少年龄段：${missingAgeBands.join('、')}`)
    if (!/教学假设/.test(guideText) || !/不.*能力诊断|能力诊断.*不/.test(guideText)) {
      invalidEntries.push('分龄指南必须声明教学假设与非能力诊断边界')
    }
    ageScaffoldingGuide = {
      asset: guideAsset,
      lessonSections: 12 - missingLessonSections.length,
      ageBands: 3 - missingAgeBands.length,
    }
  }
}

const evidenceMapAsset = delivery.deliveryPolicy?.evidenceMap
if (typeof evidenceMapAsset !== 'string' || !evidenceMapAsset.endsWith('.json')) {
  invalidEntries.push('缺少 evidenceMap')
} else {
  const evidenceMapFile = path.resolve(projectDir, evidenceMapAsset)
  const evidence = await fs.readFile(evidenceMapFile, 'utf8')
    .then(JSON.parse)
    .catch(() => null)
  if (!evidence) missingAssets.push(`evidenceMap:${evidenceMapAsset}`)
  else {
    const sourceIds = new Set()
    const duplicateSourceIds = []
    const invalidSources = []
    const allowedSourceHosts = new Set([
      'arxiv.org',
      'www.apa.org',
      'www.cac.gov.cn',
      'www.nist.gov',
      'www.npc.gov.cn',
      'www.unesco.org',
      'www.unicef.org',
    ])
    for (const source of evidence.sources || []) {
      if (sourceIds.has(source.id)) duplicateSourceIds.push(source.id)
      sourceIds.add(source.id)
      let sourceUrl = null
      try {
        sourceUrl = new URL(source.url)
      } catch {
        invalidSources.push(`${source.id || '未命名来源'}:URL`)
      }
      if (!/^S\d{2}$/.test(source.id || '')) invalidSources.push(`${source.id || '未命名来源'}:ID`)
      if (!source.issuer || !source.title || !source.supports) invalidSources.push(`${source.id || '未命名来源'}:元数据`)
      if (sourceUrl && (sourceUrl.protocol !== 'https:' || !allowedSourceHosts.has(sourceUrl.hostname))) {
        invalidSources.push(`${source.id || '未命名来源'}:非允许的官方或一手研究域名`)
      }
    }
    const evidenceLessonIds = new Set()
    const invalidLessonMappings = []
    for (const mapping of evidence.lessons || []) {
      if (evidenceLessonIds.has(mapping.lessonId)) invalidLessonMappings.push(`${mapping.lessonId}:重复`)
      evidenceLessonIds.add(mapping.lessonId)
      const deliveryLesson = (delivery.lessons || []).find((lesson) => lesson.lessonId === mapping.lessonId)
      if (!deliveryLesson) invalidLessonMappings.push(`${mapping.lessonId}:不在交付清单`)
      if (!Array.isArray(mapping.sourceIds) || mapping.sourceIds.length === 0) {
        invalidLessonMappings.push(`${mapping.lessonId}:无来源`)
      } else if (mapping.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
        invalidLessonMappings.push(`${mapping.lessonId}:引用未知来源`)
      }
      if (!mapping.campaignScaffold || !mapping.caveat) invalidLessonMappings.push(`${mapping.lessonId}:缺少教学支架或边界`)
      const scriptText = mapping.scriptAsset
        ? await fs.readFile(path.resolve(projectDir, mapping.scriptAsset), 'utf8').catch(() => '')
        : ''
      if (!scriptText) missingAssets.push(`${mapping.lessonId}:${mapping.scriptAsset || 'scriptAsset'}`)
      else if (!scriptText.startsWith(`# ${mapping.lessonId}｜`)) invalidLessonMappings.push(`${mapping.lessonId}:脚本标题不匹配`)
    }
    const expectedEvidenceIds = Array.from({ length: 12 }, (_, index) => `L${String(index + 1).padStart(2, '0')}`)
    const missingLessonMappings = expectedEvidenceIds.filter((lessonId) => !evidenceLessonIds.has(lessonId))
    const l10Sources = new Set((evidence.lessons || []).find((item) => item.lessonId === 'L10')?.sourceIds || [])
    const l11Sources = new Set((evidence.lessons || []).find((item) => item.lessonId === 'L11')?.sourceIds || [])
    if (!["S06", "S07", "S08"].every((sourceId) => l10Sources.has(sourceId))) {
      invalidLessonMappings.push('L10:法律与生成标识来源不完整')
    }
    if (!["S09", "S10", "S11", "S12"].every((sourceId) => l11Sources.has(sourceId))) {
      invalidLessonMappings.push('L11:拟人化互动与心理安全来源不完整')
    }
    if (evidence.version !== 1) invalidEntries.push('证据映射版本必须为 1')
    if (evidence.campaignId !== delivery.campaignId) invalidEntries.push('证据映射 campaignId 不匹配')
    if (!/^2026-\d{2}-\d{2}$/.test(evidence.verifiedAt || '')) invalidEntries.push('证据映射缺少 verifiedAt')
    if (!Array.isArray(evidence.usePolicy) || evidence.usePolicy.length < 4) invalidEntries.push('证据映射 usePolicy 不完整')
    if (!Array.isArray(evidence.globalDisallowedClaims) || evidence.globalDisallowedClaims.length < 5) {
      invalidEntries.push('证据映射禁止效果声明不完整')
    }
    if ((evidence.sources || []).length < 10) invalidEntries.push('证据映射权威或一手来源少于 10 项')
    if (duplicateSourceIds.length) invalidEntries.push(`证据映射来源 ID 重复：${duplicateSourceIds.join('、')}`)
    if (invalidSources.length) invalidEntries.push(`证据映射来源无效：${invalidSources.join('、')}`)
    if (missingLessonMappings.length) invalidEntries.push(`证据映射缺少课节：${missingLessonMappings.join('、')}`)
    if (invalidLessonMappings.length) invalidEntries.push(`证据映射课节无效：${invalidLessonMappings.join('、')}`)
    evidenceMap = {
      asset: evidenceMapAsset,
      verifiedAt: evidence.verifiedAt || null,
      sources: (evidence.sources || []).length,
      lessonMappings: (evidence.lessons || []).length,
      usePolicies: (evidence.usePolicy || []).length,
      disallowedClaims: (evidence.globalDisallowedClaims || []).length,
      invalidSources: invalidSources.length,
      invalidLessonMappings: invalidLessonMappings.length,
    }
  }
}

for (const lesson of delivery.lessons || []) {
  const label = lesson.lessonId || '未命名课节'
  if (!/^L(?:0[1-9]|1[0-2])$/.test(label)) invalidEntries.push(`${label}：lessonId 无效`)
  if (lessonIds.has(label)) invalidEntries.push(`${label}：lessonId 重复`)
  lessonIds.add(label)
  if (!/^2026-(?:08|09)-\d{2}$/.test(lesson.date || '')) invalidEntries.push(`${label}：date 无效`)
  if (lesson.platform !== 'zsxq') invalidEntries.push(`${label}：当前交付平台必须为 zsxq`)
  if (!allowedStatuses.has(lesson.status)) invalidEntries.push(`${label}：未知状态 ${lesson.status}`)
  if (companionIds.has(lesson.companionEntryId)) invalidEntries.push(`${label}：companionEntryId 重复`)
  companionIds.add(lesson.companionEntryId)

  const companion = calendarEntries.find((entry) => entry.id === lesson.companionEntryId)
  if (!companion) invalidEntries.push(`${label}：找不到知识星球承接条目 ${lesson.companionEntryId}`)
  else {
    if (companion.platform !== lesson.platform) invalidEntries.push(`${label}：承接条目平台不一致`)
    if (companion.date !== lesson.date) invalidEntries.push(`${label}：承接条目日期不一致`)
    if (!['draft_ready', 'published'].includes(companion.status)) {
      invalidEntries.push(`${label}：承接条目状态 ${companion.status} 不可交付`)
    }
    const fallbackAsset = (companion.assets || []).find((asset) => asset.endsWith('-publish.txt'))
    const fallbackText = fallbackAsset
      ? await fs.readFile(path.resolve(projectDir, fallbackAsset), 'utf8').catch(() => '')
      : ''
    const claimsAttachedVideo = /(?:本帖|所附)[^\n]*(?:视频|试听)|(?:视频|试听)[^\n]*(?:已上传|可播放)/.test(fallbackText)
    fallbackPayloadChecks.push({ lessonId: label, asset: fallbackAsset || null, claimsAttachedVideo })
    if (!fallbackAsset || !fallbackText) invalidEntries.push(`${label}：缺少自包含文字回退载荷`)
    if (claimsAttachedVideo) invalidEntries.push(`${label}：文字回退载荷不得声称视频已附加或可播放`)
  }

  const video = await inspectAsset(lesson.videoAsset, '.mp4')
  if (!video.exists) missingAssets.push(`${label}:${lesson.videoAsset}`)
  else {
    totalVideoBytes += video.bytes
    if (video.bytes === 0) invalidEntries.push(`${label}：视频为空文件`)
    if (video.bytes > 100 * 1024 * 1024) invalidEntries.push(`${label}：视频超过 100 MiB`)
  }

  const subtitle = await inspectAsset(lesson.subtitleAsset, '.vtt')
  if (!subtitle.exists) missingAssets.push(`${label}:${lesson.subtitleAsset}`)
  else {
    const text = await fs.readFile(path.resolve(projectDir, lesson.subtitleAsset), 'utf8')
    if (!text.startsWith('WEBVTT') || !text.includes('-->')) invalidEntries.push(`${label}：字幕不是有效 WebVTT`)
  }

  if (label === 'L01') {
    const asset = lesson.worksheetAsset
    const worksheetFile = typeof asset === 'string' ? path.resolve(projectDir, asset) : ''
    const worksheetInfo = worksheetFile
      ? await fs.stat(worksheetFile).catch(() => null)
      : null
    if (!asset?.endsWith('.pdf') || !worksheetInfo?.isFile()) {
      missingAssets.push(`${label}:${asset || 'worksheetAsset'}`)
    } else {
      const pdfInfo = await runCommand('pdfinfo', [worksheetFile])
      const pdfText = await runCommand('pdftotext', [worksheetFile, '-'])
      const requiredPhrases = [
        '这张卡无需整张上传',
        '家庭本地练习',
        '不作为儿童能力评价或课程效果证明',
        '输入',
        '输出',
        '错误',
        '真人检查者',
      ]
      const missingPhrases = requiredPhrases.filter((phrase) => !pdfText.includes(phrase))
      if (!/^Pages:\s+1$/m.test(pdfInfo)) invalidEntries.push('L01：家庭 AI 足迹卡必须为单页 PDF')
      if (!/^Page size:\s+595\.\d+ x 841\.\d+ pts \(A4\)$/m.test(pdfInfo)) {
        invalidEntries.push('L01：家庭 AI 足迹卡必须为 A4')
      }
      if (missingPhrases.length) invalidEntries.push(`L01：家庭 AI 足迹卡缺少边界或观察字段：${missingPhrases.join('、')}`)
      if (!allowedWorksheetStatuses.has(lesson.worksheetStatus)) invalidEntries.push('L01：练习卡状态无效')
      if (lesson.worksheetAttachmentAssetId !== 'l01-family-ai-footprint-card') {
        invalidEntries.push('L01：练习卡附件 ID 与发布清单不一致')
      }
      if (lesson.worksheetStatus === 'local_ready') {
        for (const field of ['worksheetPublishedAt', 'worksheetVerifiedAt', 'worksheetExternalUrl', 'worksheetVerification', 'worksheetSha256']) {
          if (lesson[field]) invalidEntries.push(`L01：local_ready 不得包含 ${field}`)
        }
      } else if (lesson.worksheetStatus === 'published_verified') {
        if (!lesson.worksheetPublishedAt || Number.isNaN(Date.parse(lesson.worksheetPublishedAt))) {
          invalidEntries.push('L01：published_verified 缺少有效 worksheetPublishedAt')
        }
        if (!lesson.worksheetVerifiedAt || Number.isNaN(Date.parse(lesson.worksheetVerifiedAt))) {
          invalidEntries.push('L01：published_verified 缺少有效 worksheetVerifiedAt')
        }
        try {
          const worksheetUrl = new URL(lesson.worksheetExternalUrl)
          const isTopicDetail = worksheetUrl.hostname === 'wx.zsxq.com' && worksheetUrl.pathname.includes('/topic_detail/')
          const isTopicShare = worksheetUrl.hostname === 't.zsxq.com' && /^\/[A-Za-z0-9_-]{3,32}\/?$/.test(worksheetUrl.pathname)
          if (worksheetUrl.protocol !== 'https:' || worksheetUrl.search || worksheetUrl.hash || (!isTopicDetail && !isTopicShare)) {
            invalidEntries.push('L01：worksheetExternalUrl 不是具体知识星球主题 URL')
          }
        } catch {
          invalidEntries.push('L01：published_verified 缺少有效 worksheetExternalUrl')
        }
        if (!/(?:PDF|练习卡)[^\n]*(?:可见|可下载|附件)|(?:可见|可下载|附件)[^\n]*(?:PDF|练习卡)/.test(lesson.worksheetVerification || '')) {
          invalidEntries.push('L01：published_verified 缺少练习卡附件可见证据')
        }
        if (!/^[a-f0-9]{64}$/.test(lesson.worksheetSha256 || '')) {
          invalidEntries.push('L01：published_verified 缺少练习卡 SHA-256')
        }
      }
      worksheet = {
        asset,
        attachmentAssetId: lesson.worksheetAttachmentAssetId,
        status: lesson.worksheetStatus,
        pages: /^Pages:\s+1$/m.test(pdfInfo) ? 1 : null,
        pageSize: /^Page size:\s+595\.\d+ x 841\.\d+ pts \(A4\)$/m.test(pdfInfo) ? 'A4' : null,
        bytes: worksheetInfo.size,
        missingPhrases,
      }
    }
  } else if (lesson.worksheetAsset || lesson.worksheetStatus || lesson.worksheetAttachmentAssetId) {
    invalidEntries.push(`${label}：当前只有 L01 配置家庭 AI 足迹卡`)
  }

  if (lesson.status === 'published') {
    if (!lesson.publishedAt || Number.isNaN(Date.parse(lesson.publishedAt))) {
      invalidEntries.push(`${label}：published 缺少有效 publishedAt`)
    }
    try {
      const url = new URL(lesson.externalUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'wx.zsxq.com') {
        invalidEntries.push(`${label}：published externalUrl 不是知识星球 HTTPS 地址`)
      }
    } catch {
      invalidEntries.push(`${label}：published 缺少有效 externalUrl`)
    }
    if (!['verified_available', 'not_verified'].includes(lesson.subtitleAvailability)) {
      invalidEntries.push(`${label}：published 必须明确登记 subtitleAvailability`)
    }
  } else if (lesson.status === 'local_ready' && (lesson.publishedAt || lesson.externalUrl)) {
    invalidEntries.push(`${label}：local_ready 不得带发布证据`)
  }
}

const expectedLessonIds = Array.from({ length: 12 }, (_, index) => `L${String(index + 1).padStart(2, '0')}`)
for (const lessonId of expectedLessonIds) {
  if (!lessonIds.has(lessonId)) invalidEntries.push(`${lessonId}：缺少交付条目`)
}
if ((delivery.lessons || []).length !== 12) invalidEntries.push(`课程交付条目应为 12，当前为 ${(delivery.lessons || []).length}`)

const statusCounts = Object.fromEntries(
  [...allowedStatuses].map((status) => [status, (delivery.lessons || []).filter((item) => item.status === status).length]),
)
const report = {
  campaignId: delivery.campaignId,
  state: invalidEntries.length || missingAssets.length || statusCounts.blocked ? 'blocked' : 'ready',
  lessons: (delivery.lessons || []).length,
  mediaType: delivery.deliveryPolicy?.mediaType || null,
  statusCounts,
  totalVideoBytes,
  totalVideoMiB: Number((totalVideoBytes / 1024 / 1024).toFixed(2)),
  ageScaffoldingGuide,
  evidenceMap,
  worksheet,
  successDisclosure: delivery.deliveryPolicy?.successDisclosure || null,
  fallbackPayloadChecks,
  missingAssets,
  invalidEntries,
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else {
  process.stdout.write([
    '# 课程视频平台交付审计',
    '',
    `- 状态：${report.state}`,
    `- 课节：${report.lessons}`,
    `- 本地就绪 / 已发布 / 阻断：${statusCounts.local_ready || 0} / ${statusCounts.published || 0} / ${statusCounts.blocked || 0}`,
    `- 视频总量：${report.totalVideoMiB} MiB`,
    `- 逐课证据映射：${evidenceMap ? `${evidenceMap.lessonMappings} 课 / ${evidenceMap.sources} 个来源` : '缺失'}`,
    `- 缺失素材：${missingAssets.length}`,
    `- 无效条目：${invalidEntries.length}`,
    '',
  ].join('\n'))
}
if (args.expectReady && report.state !== 'ready') process.exitCode = 1

function parseArgs(values) {
  const parsed = { expectReady: false, file: '', json: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--expect-ready') parsed.expectReady = true
    else if (value === '--file') parsed.file = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

async function loadCalendars() {
  const directory = path.resolve(projectDir, 'ops/campaigns')
  const names = (await fs.readdir(directory))
    .filter((name) => /^ai-native-generation-30d-week\d+-content-calendar\.json$/.test(name))
    .sort()
  return Promise.all(names.map((name) => fs.readFile(path.join(directory, name), 'utf8').then(JSON.parse)))
}

async function inspectAsset(asset, extension) {
  if (typeof asset !== 'string' || !asset.endsWith(extension)) return { exists: false, bytes: 0 }
  const stat = await fs.stat(path.resolve(projectDir, asset)).catch(() => null)
  return { exists: Boolean(stat?.isFile()), bytes: stat?.size || 0 }
}

async function runCommand(command, values) {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)(command, values, { encoding: 'utf8' })
  return stdout
}

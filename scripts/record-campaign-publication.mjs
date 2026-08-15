import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const cliArgs = process.argv.slice(2)
if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  process.stdout.write(renderHelp())
  process.exit(0)
}
const args = parseArgs(cliArgs)
validateArgs(args)
const logFile = path.resolve(projectDir, args.log || 'ops/campaigns/ai-native-generation-30d-log.json')
const calendarFile = args.calendar
  ? path.resolve(projectDir, args.calendar)
  : await findCalendar(args.publishedAt.slice(0, 10))
const [log, calendar] = await Promise.all([readJson(logFile), readJson(calendarFile)])
const calendarEntry = calendar.entries.find((entry) => entry.id === args.calendarEntry)
if (!calendarEntry) throw new Error(`周历中不存在 ${args.calendarEntry}。`)
if (calendarEntry.platform !== args.platform) throw new Error('周历条目平台与 --platform 不一致。')
if (calendarEntry.date !== args.publishedAt.slice(0, 10)) throw new Error('周历日期与 --published-at 日期不一致。')
if (calendarEntry.title !== args.title) throw new Error('周历标题与 --title 不一致。')
const lateSlotPublicationGates = new Set([
  'w1-x-05', 'w1-zsxq-06',
  'w2-x-05', 'w2-zsxq-07',
  'w4-x-05', 'w4-zsxq-07',
])
const publicationNotBefore = calendarEntry.scheduledFor
  || (lateSlotPublicationGates.has(calendarEntry.id) ? `${calendarEntry.date}T20:00:00+08:00` : null)
  || (new Set(['x', 'zsxq']).has(calendarEntry.platform)
    ? `${calendarEntry.date}T09:00:00+08:00`
    : `${calendarEntry.date}T00:00:00+08:00`)
if (Date.parse(args.publishedAt) < Date.parse(publicationNotBefore)) {
  throw new Error(`${args.calendarEntry} 的公开时间早于活动门禁 ${publicationNotBefore}。`)
}
if (args.recordedAt && Date.parse(args.recordedAt) < Date.parse(args.publishedAt)) {
  throw new Error('--recorded-at 不能早于 --published-at。')
}
const previousStatus = calendarEntry.status
if (previousStatus === 'published') throw new Error(`${args.calendarEntry} 已登记为 published。`)
if (args.mediaVerified) {
  if (!calendarEntry.mediaAttachment) {
    throw new Error('--media-verified 要求周历条目存在 mediaAttachment。')
  }
  if (!/视频.*可播放|可播放.*视频/.test(args.verification)) {
    throw new Error('--media-verified 要求 verification 明确说明视频可播放证据。')
  }
}
const mediaEvidence = args.mediaVerified
  ? await buildMediaEvidence(calendarEntry.mediaAttachment.videoAsset)
  : null
if (args.subtitleVerified) {
  if (!args.mediaVerified) throw new Error('--subtitle-verified 要求同时使用 --media-verified。')
  if (!/字幕.*可用|可用.*字幕/.test(args.verification)) {
    throw new Error('--subtitle-verified 要求 verification 明确说明字幕可用证据。')
  }
}
if (args.altTextVerified) {
  if (!args.mediaVerified) throw new Error('--alt-text-verified 要求同时使用 --media-verified。')
  if (!calendarEntry.mediaAttachment?.altText) {
    throw new Error('--alt-text-verified 要求周历媒体绑定已审校替代文本。')
  }
  const altTextSha256 = crypto.createHash('sha256').update(calendarEntry.mediaAttachment.altText).digest('hex')
  if (altTextSha256 !== calendarEntry.mediaAttachment.altTextSha256) {
    throw new Error('周历媒体替代文本与 altTextSha256 不一致。')
  }
  if (!/替代文本.*(?:已设置|可用)|(?:已设置|可用).*替代文本/.test(args.verification)) {
    throw new Error('--alt-text-verified 要求 verification 明确说明替代文本已设置或可用。')
  }
}
const contentIntegrity = await buildContentIntegrity(args, calendarEntry)
const sourceIntegrity = await buildSourceIntegrity(args, calendarEntry)

const allPublishes = (log.dailyRuns || []).flatMap((run) => run.externalPublishes || [])
const isSharedZsxqGroupUrl = args.platform === 'zsxq' && new URL(args.url).pathname.startsWith('/group/')
const duplicate = allPublishes.find((item) =>
  (item.platform === args.platform && item.title === args.title && item.publishedAt === args.publishedAt)
  || (!isSharedZsxqGroupUrl && item.platform === args.platform
    && [item.url, item.topicUrl].filter(Boolean).includes(args.url))
  || (args.externalId && item.platform === args.platform
    && [item.externalId, item.articleId, item.itemId, item.statusId].includes(args.externalId)),
)
if (duplicate) throw new Error(`发布证据已存在：${args.platform} ${args.externalId || args.url}`)

const publication = {
  platform: args.platform,
  calendarEntryId: args.calendarEntry,
  title: args.title,
  publishedAt: args.publishedAt,
  url: args.url,
  ...(args.externalId ? { externalId: args.externalId } : {}),
  ...(args.contentSha256 ? { contentSha256: args.contentSha256 } : {}),
  ...(contentIntegrity ? { contentIntegrity } : {}),
  ...(sourceIntegrity ? { sourceIntegrity } : {}),
  ...(isSharedZsxqGroupUrl ? { sharedGroupUrl: true } : {}),
  ...(args.pinned ? { pinned: true } : {}),
  ...(args.mediaVerified ? {
    media: {
      mediaType: calendarEntry.mediaAttachment.mediaType,
      videoAsset: calendarEntry.mediaAttachment.videoAsset,
      sha256: mediaEvidence.sha256,
      bytes: mediaEvidence.bytes,
      playable: true,
      subtitleStatus: args.subtitleVerified ? 'verified_available' : 'not_verified',
      altTextStatus: args.altTextVerified ? 'verified_available' : 'not_verified',
      ...(args.altTextVerified ? {
        altText: {
          sha256: calendarEntry.mediaAttachment.altTextSha256,
          characters: [...calendarEntry.mediaAttachment.altText].length,
        },
      } : {}),
    },
  } : {}),
  ...buildInitialMetrics(args),
  verification: args.verification,
}
const dateKey = args.publishedAt.slice(0, 10)
let dailyRun = (log.dailyRuns || []).find((run) => run.date === dateKey)
if (!dailyRun) {
  dailyRun = {
    date: dateKey,
    phase: 'execution',
    status: 'in_progress',
    outputs: [],
    externalPublishes: [],
    scheduledPublishes: [],
    metricSnapshots: [],
    blockers: [],
    notes: [],
  }
  log.dailyRuns.push(dailyRun)
}
dailyRun.externalPublishes ||= []
dailyRun.externalPublishes.push(publication)
dailyRun.notes ||= []
dailyRun.notes.push(`${args.platform} 发布证据已登记；外部 URL 与发布时间经可见页面核验。`)
log.updatedAt = args.recordedAt || new Date().toISOString()

calendarEntry.status = 'published'
calendarEntry.externalUrl = args.url
calendarEntry.publishedAt = args.publishedAt
if (args.externalId) calendarEntry.externalId = args.externalId
if (args.pinned) calendarEntry.pinned = true
if (args.mediaVerified) {
  calendarEntry.mediaAttachment.status = 'published'
  calendarEntry.mediaAttachment.publishedAt = args.publishedAt
  calendarEntry.mediaAttachment.externalUrl = args.url
  calendarEntry.mediaAttachment.sha256 = mediaEvidence.sha256
  calendarEntry.mediaAttachment.bytes = mediaEvidence.bytes
  calendarEntry.mediaAttachment.subtitleAvailability = args.subtitleVerified
    ? 'verified_available'
    : 'not_verified_after_platform_upload'
  calendarEntry.mediaAttachment.altTextAvailability = args.altTextVerified
    ? 'verified_available'
    : 'not_verified_after_platform_upload'
}

const result = {
  campaignId: log.campaignId,
  mode: args.apply ? 'apply' : 'dry_run',
  publication,
  publicationNotBefore,
  calendar: path.relative(projectDir, calendarFile),
  calendarEntry: calendarEntry.id,
  previousStatus,
  writesPerformed: false,
}

if (args.apply) {
  await Promise.all([
    fs.writeFile(logFile, `${JSON.stringify(log, null, 2)}\n`, 'utf8'),
    fs.writeFile(calendarFile, `${JSON.stringify(calendar, null, 2)}\n`, 'utf8'),
  ])
  result.writesPerformed = true
}

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  process.stdout.write([
    '# 发布证据登记',
    '',
    `- 模式：${result.mode}`,
    `- 平台：${args.platform}`,
    `- 标题：${args.title}`,
    `- 发布时间：${args.publishedAt}`,
    `- URL：${args.url}`,
    `- 周历条目：${args.calendarEntry}`,
    `- 可见置顶：${args.pinned ? '是' : '未登记'}`,
    `- 视频可播放：${args.mediaVerified ? '是' : '未登记'}`,
    `- 字幕可用：${args.subtitleVerified ? '是' : '未核验'}`,
    `- 替代文本可用：${args.altTextVerified ? '是' : '未核验'}`,
    `- 已写入：${result.writesPerformed ? '是' : '否'}`,
    '',
    '> 默认 dry_run；只有显式 --apply 才更新本地运营日志与周历。此工具不操作外部平台。',
    '',
  ].join('\n'))
}

function parseArgs(values) {
  const parsed = {
    altTextVerified: false,
    apply: false,
    calendar: '',
    calendarEntry: '',
    externalId: '',
    comments: '',
    contentFile: '',
    contentSha256: '',
    crosslinkDestination: '',
    impressions: '',
    likes: '',
    reads: '',
    reposts: '',
    bookmarks: '',
    json: false,
    log: '',
    mediaVerified: false,
    platform: '',
    pinned: false,
    publishedAt: '',
    recordedAt: '',
    sourceFile: '',
    sourceSha256: '',
    title: '',
    url: '',
    verification: '',
    subtitleVerified: false,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--alt-text-verified') parsed.altTextVerified = true
    else if (value === '--calendar') parsed.calendar = values[++index] || ''
    else if (value === '--calendar-entry') parsed.calendarEntry = values[++index] || ''
    else if (value === '--external-id') parsed.externalId = values[++index] || ''
    else if (value === '--comments') parsed.comments = values[++index] ?? ''
    else if (value === '--content-file') parsed.contentFile = values[++index] || ''
    else if (value === '--content-sha256') parsed.contentSha256 = values[++index] || ''
    else if (value === '--crosslink-destination') parsed.crosslinkDestination = values[++index] || ''
    else if (value === '--impressions') parsed.impressions = values[++index] ?? ''
    else if (value === '--likes') parsed.likes = values[++index] ?? ''
    else if (value === '--reads') parsed.reads = values[++index] ?? ''
    else if (value === '--reposts') parsed.reposts = values[++index] ?? ''
    else if (value === '--bookmarks') parsed.bookmarks = values[++index] ?? ''
    else if (value === '--json') parsed.json = true
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--media-verified') parsed.mediaVerified = true
    else if (value === '--platform') parsed.platform = values[++index] || ''
    else if (value === '--pinned') parsed.pinned = true
    else if (value === '--published-at') parsed.publishedAt = values[++index] || ''
    else if (value === '--recorded-at') parsed.recordedAt = values[++index] || ''
    else if (value === '--source-file') parsed.sourceFile = values[++index] || ''
    else if (value === '--source-sha256') parsed.sourceSha256 = values[++index] || ''
    else if (value === '--title') parsed.title = values[++index] || ''
    else if (value === '--url') parsed.url = values[++index] || ''
    else if (value === '--verification') parsed.verification = values[++index] || ''
    else if (value === '--subtitle-verified') parsed.subtitleVerified = true
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

function validateArgs(value) {
  const allowedPlatforms = new Set(['website', 'wechat', 'csdn', 'x', 'toutiao', 'zsxq'])
  if (!allowedPlatforms.has(value.platform)) throw new Error('--platform 无效。')
  for (const field of ['calendarEntry', 'publishedAt', 'title', 'url', 'verification']) {
    if (!value[field]) throw new Error(`--${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} 不能为空。`)
  }
  if (Number.isNaN(Date.parse(value.publishedAt))) throw new Error('--published-at 不是有效时间。')
  if (value.recordedAt && Number.isNaN(Date.parse(value.recordedAt))) throw new Error('--recorded-at 不是有效时间。')
  const url = new URL(value.url)
  if (url.protocol !== 'https:') throw new Error('--url 必须使用 HTTPS。')
  validatePublicationUrl(url, value.platform)
  if (value.verification.length < 12) throw new Error('--verification 必须说明可见核验证据。')
  if (value.pinned && value.platform !== 'zsxq') throw new Error('--pinned 只适用于知识星球。')
  if (value.pinned && !value.verification.includes('置顶')) {
    throw new Error('--pinned 要求 verification 明确说明可见置顶证据。')
  }
  if (value.subtitleVerified && !value.mediaVerified) {
    throw new Error('--subtitle-verified 要求同时使用 --media-verified。')
  }
  if (value.altTextVerified && !value.mediaVerified) {
    throw new Error('--alt-text-verified 要求同时使用 --media-verified。')
  }
  if (value.contentSha256 && !/^[a-f0-9]{64}$/.test(value.contentSha256)) {
    throw new Error('--content-sha256 必须是 64 位小写十六进制 SHA-256。')
  }
  if (new Set(['x', 'zsxq']).has(value.platform) && !value.contentSha256) {
    throw new Error('X/知识星球发布必须提供 --content-sha256，以绑定最终公开正文。')
  }
  if (value.contentFile && !value.contentSha256) {
    throw new Error('--content-file 要求同时提供 --content-sha256。')
  }
  if (value.crosslinkDestination && (value.platform !== 'x' || !value.contentFile)) {
    throw new Error('--crosslink-destination 只适用于 X，且要求同时提供 --content-file。')
  }
  if (Boolean(value.sourceFile) !== Boolean(value.sourceSha256)) {
    throw new Error('--source-file 与 --source-sha256 必须同时提供。')
  }
  if (value.sourceSha256 && !/^[a-f0-9]{64}$/.test(value.sourceSha256)) {
    throw new Error('--source-sha256 必须是 64 位小写十六进制 SHA-256。')
  }
  for (const field of ['impressions', 'reads', 'likes', 'comments', 'reposts', 'bookmarks']) {
    if (value[field] === '') continue
    const metric = Number(value[field])
    if (!Number.isInteger(metric) || metric < 0) throw new Error(`--${field} 必须是非负整数。`)
  }
}

function buildInitialMetrics(value) {
  const fields = ['impressions', 'reads', 'likes', 'comments', 'reposts', 'bookmarks']
  const initialMetrics = Object.fromEntries(
    fields.filter((field) => value[field] !== '').map((field) => [field, Number(value[field])]),
  )
  const present = Object.keys(initialMetrics)
  if (present.length === 0) return { initialMetricsStatus: 'not_obtained' }
  const expected = {
    website: [],
    wechat: ['reads', 'likes'],
    csdn: ['reads'],
    x: ['impressions', 'comments', 'reposts', 'likes'],
    toutiao: ['impressions', 'reads', 'likes', 'comments'],
    zsxq: ['reads', 'comments', 'likes'],
  }[value.platform]
  const complete = expected.length > 0 && expected.every((field) => present.includes(field))
  return {
    initialMetricsStatus: complete ? 'captured' : 'captured_partial',
    initialMetrics,
  }
}

function validatePublicationUrl(url, platform) {
  const hostname = url.hostname.toLowerCase()
  const pathname = url.pathname
  const valid = {
    website: (hostname === 'ai-knowledgepoints.cn' || hostname === 'www.ai-knowledgepoints.cn')
      && pathname.startsWith('/ai-native-generation'),
    wechat: hostname === 'mp.weixin.qq.com' && (pathname === '/s' || pathname.startsWith('/s/')),
    csdn: hostname === 'blog.csdn.net' && pathname.includes('/article/details/'),
    x: (hostname === 'x.com' || hostname === 'twitter.com') && pathname.includes('/status/'),
    toutiao: (hostname === 'toutiao.com' || hostname === 'www.toutiao.com')
      && (pathname.startsWith('/item/') || pathname.startsWith('/article/')),
    zsxq: !url.search && !url.hash && (
      (hostname === 'wx.zsxq.com'
        && (pathname.startsWith('/group/') || pathname.includes('/topic_detail/')))
      || (hostname === 't.zsxq.com' && /^\/[A-Za-z0-9_-]{3,32}\/?$/.test(pathname))
    ),
  }[platform]
  if (!valid) throw new Error(`--url 不是 ${platform} 可核验的公开内容地址。`)
}

async function findCalendar(dateKey) {
  const directory = path.join(projectDir, 'ops', 'campaigns')
  const names = (await fs.readdir(directory))
    .filter((name) => /^ai-native-generation-30d-week\d+-content-calendar\.json$/.test(name))
  for (const name of names) {
    const filename = path.join(directory, name)
    const calendar = await readJson(filename)
    if (dateKey >= calendar.period.startsOn && dateKey <= calendar.period.endsOn) return filename
  }
  throw new Error(`${dateKey} 没有对应周历。`)
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'))
}

async function buildMediaEvidence(relativeFile) {
  const file = path.resolve(projectDir, relativeFile || '')
  let content
  try {
    content = await fs.readFile(file)
  } catch {
    throw new Error(`媒体文件不存在，无法登记可播放证据：${relativeFile}`)
  }
  if (content.byteLength === 0) throw new Error(`媒体文件为空：${relativeFile}`)
  return {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    bytes: content.byteLength,
  }
}

async function buildContentIntegrity(value, calendarEntry) {
  if (!value.contentSha256) return null
  const activityDir = path.resolve(projectDir, 'content', 'campaigns', 'ai-native-generation-30d')
  if (value.contentFile) {
    const file = path.resolve(projectDir, value.contentFile)
    const tempDir = path.resolve(os.tmpdir())
    const allowedActivityFile = file.startsWith(`${activityDir}${path.sep}`)
    const allowedTemporaryFile = file.startsWith(`${tempDir}${path.sep}`)
    if (!allowedActivityFile && !allowedTemporaryFile) {
      throw new Error('--content-file 必须位于本活动内容目录或系统临时目录。')
    }
    if (!path.basename(file).startsWith(`${calendarEntry.date}-`) || !file.endsWith('-publish.txt')) {
      throw new Error('--content-file 必须是与周历日期一致的纯发布载荷 -publish.txt。')
    }
    let source
    try {
      source = await fs.readFile(file, 'utf8')
    } catch {
      throw new Error(`纯发布载荷不存在：${value.contentFile}`)
    }
    if (!source.trim()) throw new Error(`纯发布载荷为空：${value.contentFile}`)
    let finalPayload = source
    let status = 'verified_local_file'
    if (value.crosslinkDestination) {
      const destination = validateCrosslinkDestination(value.crosslinkDestination)
      const matches = [...source.matchAll(/https:\/\/wx\.zsxq\.com\/[^\s]+/g)]
      if (matches.length !== 1) {
        throw new Error(`跨链源载荷必须且只能包含 1 个知识星球链接，当前为 ${matches.length} 个。`)
      }
      finalPayload = source.replace(matches[0][0], destination.toString())
      status = 'verified_runtime_crosslink'
    }
    const sha256 = crypto.createHash('sha256').update(finalPayload).digest('hex')
    if (sha256 !== value.contentSha256) {
      throw new Error(`--content-sha256 与最终正文不一致；本地复算为 ${sha256}。`)
    }
    return {
      status,
      file: path.relative(projectDir, file),
      sha256,
      bytes: Buffer.byteLength(finalPayload),
      ...(value.crosslinkDestination ? { crosslinkDestination: value.crosslinkDestination } : {}),
    }
  }

  const candidates = (calendarEntry.assets || []).filter((asset) => asset.endsWith('-publish.txt'))
  for (const candidate of candidates) {
    const file = path.resolve(projectDir, candidate)
    const content = await fs.readFile(file).catch(() => null)
    if (!content) continue
    const sha256 = crypto.createHash('sha256').update(content).digest('hex')
    if (sha256 === value.contentSha256) {
      return {
        status: 'verified_calendar_asset',
        file: candidate,
        sha256,
        bytes: content.byteLength,
      }
    }
  }
  throw new Error('--content-sha256 未匹配周历纯发布载荷；运行时跨链必须同时提供 --content-file 和 --crosslink-destination。')
}

async function buildSourceIntegrity(value, calendarEntry) {
  if (!value.sourceFile) return null
  const file = path.resolve(projectDir, value.sourceFile)
  const relativeFile = path.relative(projectDir, file)
  const contentDir = path.resolve(projectDir, 'content')
  if (!file.startsWith(`${contentDir}${path.sep}`)) {
    throw new Error('--source-file 必须位于仓库 content 目录。')
  }
  if (!(calendarEntry.assets || []).includes(relativeFile)) {
    throw new Error('--source-file 必须是该周历条目已绑定的资产。')
  }
  if (!path.basename(file).startsWith(`${calendarEntry.date}-`) || !/\.(?:md|mdx|html|txt)$/i.test(file)) {
    throw new Error('--source-file 必须与周历日期一致且为可审校文本。')
  }
  const content = await fs.readFile(file).catch(() => null)
  if (!content?.byteLength) throw new Error(`已审校源稿不存在或为空：${value.sourceFile}`)
  const sha256 = crypto.createHash('sha256').update(content).digest('hex')
  if (sha256 !== value.sourceSha256) {
    throw new Error(`--source-sha256 与已审校源稿不一致；本地复算为 ${sha256}。`)
  }
  return {
    status: 'verified_reviewed_source',
    file: relativeFile,
    sha256,
    bytes: content.byteLength,
    scope: 'reviewed_source_not_final_platform_render',
  }
}

function validateCrosslinkDestination(value) {
  const url = new URL(value)
  const isWxDestination = url.hostname === 'wx.zsxq.com'
    && (url.pathname.startsWith('/group/') || url.pathname.includes('/topic_detail/'))
  const isTopicShareShortlink = url.hostname === 't.zsxq.com'
    && /^\/[A-Za-z0-9_-]{3,32}\/?$/.test(url.pathname)
  if (url.protocol !== 'https:' || (!isWxDestination && !isTopicShareShortlink)) {
    throw new Error('--crosslink-destination 必须是知识星球 HTTPS 链接。')
  }
  if (url.username || url.password || url.port || url.search || url.hash) {
    throw new Error('--crosslink-destination 不得包含凭证、查询参数或片段。')
  }
  return url
}

function renderHelp() {
  return [
    '发布证据登记器（只记录已经在可见页面确认的公开内容）',
    '',
    '用法：',
    '  node scripts/record-campaign-publication.mjs \\',
    '    --platform <website|wechat|csdn|x|toutiao|zsxq> \\',
    '    --title <周历中的精确标题> \\',
    '    --published-at <ISO 8601 时间> \\',
    '    --url <公开内容 HTTPS URL> \\',
    '    --verification <至少 12 字的可见核验证据> \\',
    '    --calendar-entry <周历条目 ID> [选项]',
    '',
    '选项：',
    '  --content-sha256 <64 位小写十六进制>  X/知识星球必填；绑定最终公开正文',
    '  --content-file <活动 -publish.txt>  复算正文摘要并绑定本地纯载荷',
    '  --crosslink-destination <知识星球 URL>  仅 X；复算替换直链后的最终正文',
    '  --source-file <周历已绑定文本> 与 --source-sha256 <摘要>  绑定已审校源稿；不声称平台最终渲染逐字一致',
    '  --external-id <平台内容 ID>',
    '  --pinned 仅用于已在可见页面确认置顶的知识星球主题；verification 必须说明置顶证据',
    '  --media-verified 仅在可见公开页确认附加视频可播放后使用；verification 必须说明证据',
    '  --subtitle-verified 仅在平台播放器确认字幕可用后与 --media-verified 同时使用',
    '  --alt-text-verified 仅在公开媒体详情确认周历绑定替代文本已设置或可用后与 --media-verified 同时使用',
    '  --impressions|--reads|--likes|--comments|--reposts|--bookmarks <非负整数>',
    '  --calendar <周历文件>  --log <运营日志>  --recorded-at <ISO 8601 时间>',
    '  --json  输出 JSON',
    '  --apply 写入运营日志和周历；省略时只做 dry-run',
    '  --help, -h  显示帮助',
    '',
    '安全规则：不要用后台预览页、平台首页或推测 URL；看不到的指标直接省略，不要填占位 0。',
    '',
  ].join('\n')
}

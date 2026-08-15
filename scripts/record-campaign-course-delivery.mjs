import fs from 'node:fs/promises'
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
const deliveryFile = path.resolve(
  projectDir,
  args.delivery || 'ops/campaigns/ai-native-generation-30d-course-delivery.json',
)
const logFile = path.resolve(
  projectDir,
  args.log || 'ops/campaigns/ai-native-generation-30d-log.json',
)
const calendarFile = args.calendar
  ? path.resolve(projectDir, args.calendar)
  : await findCalendar(args.lessonId)
const [delivery, log, calendar] = await Promise.all([
  readJson(deliveryFile),
  readJson(logFile),
  readJson(calendarFile),
])

const lesson = (delivery.lessons || []).find((item) => item.lessonId === args.lessonId)
if (!lesson) throw new Error(`课程交付清单中不存在 ${args.lessonId}。`)
if (lesson.status === 'published') throw new Error(`${args.lessonId} 已登记为 published。`)
if (lesson.date !== args.publishedAt.slice(0, 10)) throw new Error('课程交付日期与 --published-at 日期不一致。')
const companion = (calendar.entries || []).find((item) => item.id === lesson.companionEntryId)
if (!companion) throw new Error(`周历中不存在承接条目 ${lesson.companionEntryId}。`)
if (companion.platform !== 'zsxq') throw new Error('课程视频承接条目必须为知识星球。')
if (companion.status !== 'published') {
  throw new Error('必须先登记知识星球承接主题为 published，再登记视频可播放证据。')
}
if (companion.externalUrl && companion.externalUrl !== args.url) {
  const bothSharedGroup = isSharedGroupUrl(companion.externalUrl) && isSharedGroupUrl(args.url)
  if (!bothSharedGroup) throw new Error('--url 与已登记承接主题 URL 不一致。')
}

lesson.status = 'published'
lesson.publishedAt = args.publishedAt
lesson.externalUrl = args.url
lesson.verification = args.verification
lesson.subtitleAvailability = args.subtitleVerified ? 'verified_available' : 'not_verified'

const dateKey = args.publishedAt.slice(0, 10)
let dailyRun = (log.dailyRuns || []).find((item) => item.date === dateKey)
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
dailyRun.outputs ||= []
dailyRun.notes ||= []
dailyRun.outputs.push(`${args.lessonId} 公开试听视频已在知识星球承接主题中核验可见可播放`)
if (args.subtitleVerified) {
  dailyRun.outputs.push(`${args.lessonId} 公开试听字幕已在知识星球播放器中核验可用`)
}
dailyRun.notes.push(`${args.lessonId} 试听视频发布证据独立登记；文字主题 published 不再自动代表视频上传成功，试听播放不计课程开始或完成。`)
if (!args.subtitleVerified) {
  dailyRun.notes.push(`${args.lessonId} 字幕状态未核验；本地字幕轨或 WebVTT 文件不代表平台播放器字幕可用。`)
}
log.updatedAt = args.recordedAt || new Date().toISOString()

const result = {
  campaignId: delivery.campaignId,
  mode: args.apply ? 'apply' : 'dry_run',
  lessonId: lesson.lessonId,
  companionEntryId: lesson.companionEntryId,
  status: lesson.status,
  publishedAt: lesson.publishedAt,
  externalUrl: lesson.externalUrl,
  subtitleAvailability: lesson.subtitleAvailability,
  writesPerformed: false,
}

if (args.apply) {
  await Promise.all([
    fs.writeFile(deliveryFile, `${JSON.stringify(delivery, null, 2)}\n`, 'utf8'),
    fs.writeFile(logFile, `${JSON.stringify(log, null, 2)}\n`, 'utf8'),
  ])
  result.writesPerformed = true
}

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  process.stdout.write([
    '# 公开试听视频交付证据登记',
    '',
    `- 模式：${result.mode}`,
    `- 课节：${result.lessonId}`,
    `- 承接条目：${result.companionEntryId}`,
    `- 发布时间：${result.publishedAt}`,
    `- URL：${result.externalUrl}`,
    `- 字幕可用：${result.subtitleAvailability === 'verified_available' ? '是' : '未核验'}`,
    `- 已写入：${result.writesPerformed ? '是' : '否'}`,
    '',
    '> 默认 dry_run；只有可见主题中确认视频可播放后，才使用 --apply。',
    '',
  ].join('\n'))
}

function parseArgs(values) {
  const parsed = {
    apply: false,
    calendar: '',
    delivery: '',
    json: false,
    lessonId: '',
    log: '',
    publishedAt: '',
    recordedAt: '',
    subtitleVerified: false,
    url: '',
    verification: '',
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--calendar') parsed.calendar = values[++index] || ''
    else if (value === '--delivery') parsed.delivery = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--lesson') parsed.lessonId = values[++index] || ''
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--published-at') parsed.publishedAt = values[++index] || ''
    else if (value === '--recorded-at') parsed.recordedAt = values[++index] || ''
    else if (value === '--subtitle-verified') parsed.subtitleVerified = true
    else if (value === '--url') parsed.url = values[++index] || ''
    else if (value === '--verification') parsed.verification = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

function validateArgs(value) {
  for (const field of ['lessonId', 'publishedAt', 'url', 'verification']) {
    if (!value[field]) throw new Error(`--${field === 'lessonId' ? 'lesson' : field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} 不能为空。`)
  }
  if (!/^L(?:0[1-9]|1[0-2])$/.test(value.lessonId)) throw new Error('--lesson 必须为 L01—L12。')
  if (Number.isNaN(Date.parse(value.publishedAt))) throw new Error('--published-at 不是有效时间。')
  if (value.recordedAt && Number.isNaN(Date.parse(value.recordedAt))) throw new Error('--recorded-at 不是有效时间。')
  if (value.verification.length < 12) throw new Error('--verification 必须说明可见与可播放证据。')
  if (!/视频.*可播放|可播放.*视频/.test(value.verification)) {
    throw new Error('--verification 必须明确说明视频可播放证据。')
  }
  if (value.subtitleVerified && !/字幕.*可用|可用.*字幕/.test(value.verification)) {
    throw new Error('--subtitle-verified 要求 verification 明确说明字幕可用证据。')
  }
  const url = new URL(value.url)
  const isWxContent = url.hostname === 'wx.zsxq.com'
    && (url.pathname.startsWith('/group/') || url.pathname.includes('/topic_detail/'))
  const isTopicShareShortlink = url.hostname === 't.zsxq.com'
    && /^\/[A-Za-z0-9_-]{3,32}\/?$/.test(url.pathname)
  if (url.protocol !== 'https:' || url.search || url.hash || (!isWxContent && !isTopicShareShortlink)) {
    throw new Error('--url 必须是知识星球 HTTPS 地址。')
  }
}

async function findCalendar(lessonId) {
  const week = Number(lessonId.slice(1)) <= 3 ? 1 : Number(lessonId.slice(1)) <= 6 ? 2 : Number(lessonId.slice(1)) <= 9 ? 3 : 4
  return path.join(projectDir, 'ops', 'campaigns', `ai-native-generation-30d-week${week}-content-calendar.json`)
}

function isSharedGroupUrl(value) {
  try {
    const url = new URL(value)
    return url.hostname === 'wx.zsxq.com' && url.pathname.startsWith('/group/')
  } catch {
    return false
  }
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'))
}

function renderHelp() {
  return `公开试听视频交付证据登记\n\n用法：\n  node scripts/record-campaign-course-delivery.mjs --lesson L01 --published-at ISO --url URL --verification 说明 [--subtitle-verified] [--apply] [--json]\n\n默认只做 dry-run。必须先登记对应知识星球主题 published，并在可见页面确认视频可播放；只有平台播放器实际显示字幕可用时才使用 --subtitle-verified。本地字幕轨或 WebVTT 不代表平台字幕可用。看不到证据时不要使用 --apply。试听播放不计课程开始或完成。\n`
}

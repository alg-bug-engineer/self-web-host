import crypto from 'node:crypto'
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
const delivery = await readJson(deliveryFile)
const lesson = (delivery.lessons || []).find((item) => item.lessonId === args.lessonId)
if (!lesson) throw new Error(`课程交付清单中不存在 ${args.lessonId}。`)
if (!lesson.worksheetAsset || !lesson.worksheetAttachmentAssetId) {
  throw new Error(`${args.lessonId} 未配置练习卡资产与附件 ID。`)
}
if (lesson.worksheetStatus === 'published_verified') {
  throw new Error(`${args.lessonId} 练习卡已登记为 published_verified。`)
}
if (lesson.worksheetStatus !== 'local_ready') {
  throw new Error(`${args.lessonId} 练习卡状态必须为 local_ready。`)
}

const manifestFile = path.resolve(
  projectDir,
  args.manifest || `ops/campaigns/ai-native-generation-30d-publish-manifest-${lesson.date}.json`,
)
const [log, manifest] = await Promise.all([readJson(logFile), readJson(manifestFile)])
const manifestAsset = (manifest.assets || []).find((item) => item.id === lesson.worksheetAttachmentAssetId)
if (!manifestAsset) throw new Error(`发布清单中不存在 ${lesson.worksheetAttachmentAssetId}。`)
if (manifestAsset.role !== 'optional_worksheet_attachment') throw new Error('发布清单中的练习卡角色无效。')
if (manifestAsset.file !== lesson.worksheetAsset) throw new Error('课程交付清单与发布清单的练习卡路径不一致。')
const worksheetBytes = await fs.readFile(path.resolve(projectDir, lesson.worksheetAsset))
const worksheetSha256 = crypto.createHash('sha256').update(worksheetBytes).digest('hex')
if (worksheetSha256 !== manifestAsset.sha256) throw new Error('练习卡 SHA-256 与发布清单不一致。')

const publications = (log.dailyRuns || []).flatMap((run) => run.externalPublishes || [])
const publication = publications.find((item) =>
  item.calendarEntryId === lesson.companionEntryId
  && item.platform === 'zsxq'
  && item.url === args.url
)
if (!publication) {
  throw new Error('必须先登记同一知识星球承接主题的真实公开 URL，再登记练习卡附件证据。')
}
if (publication.publishedAt.slice(0, 10) !== lesson.date) throw new Error('承接主题发布日期与课节日期不一致。')
if (Date.parse(args.verifiedAt) < Date.parse(publication.publishedAt)) {
  throw new Error('--verified-at 不得早于承接主题发布时间。')
}

lesson.worksheetStatus = 'published_verified'
lesson.worksheetPublishedAt = publication.publishedAt
lesson.worksheetVerifiedAt = args.verifiedAt
lesson.worksheetExternalUrl = args.url
lesson.worksheetVerification = args.verification
lesson.worksheetSha256 = worksheetSha256

const dateKey = publication.publishedAt.slice(0, 10)
const dailyRun = (log.dailyRuns || []).find((item) => item.date === dateKey)
if (!dailyRun) throw new Error(`运营日志中缺少 ${dateKey} 日运行记录。`)
dailyRun.outputs ||= []
dailyRun.notes ||= []
dailyRun.outputs.push(`${args.lessonId} 家庭练习卡已在知识星球承接主题中核验为可见附件`)
dailyRun.notes.push(`${args.lessonId} 练习卡附件证据独立登记；主题 published、视频可播放与 PDF 附件可见保持三个独立状态。`)
dailyRun.notes.push('练习卡仅供家庭本地使用，无需提交整张卡；附件可见不计课程开始、完成、儿童能力或课程效果。')
log.updatedAt = args.recordedAt || new Date().toISOString()

const result = {
  campaignId: delivery.campaignId,
  mode: args.apply ? 'apply' : 'dry_run',
  lessonId: lesson.lessonId,
  companionEntryId: lesson.companionEntryId,
  worksheetStatus: lesson.worksheetStatus,
  worksheetPublishedAt: lesson.worksheetPublishedAt,
  worksheetVerifiedAt: lesson.worksheetVerifiedAt,
  worksheetExternalUrl: lesson.worksheetExternalUrl,
  worksheetSha256,
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
    '# 家庭练习卡附件证据登记',
    '',
    `- 模式：${result.mode}`,
    `- 课节：${result.lessonId}`,
    `- 承接条目：${result.companionEntryId}`,
    `- 发布时间：${result.worksheetPublishedAt}`,
    `- 可见核验时间：${result.worksheetVerifiedAt}`,
    `- URL：${result.worksheetExternalUrl}`,
    `- SHA-256：${result.worksheetSha256}`,
    `- 已写入：${result.writesPerformed ? '是' : '否'}`,
    '',
    '> 默认 dry_run；只有具体主题页面中确认 PDF 附件可见或可下载后，才使用 --apply。星球首页 URL 不能作为附件证据。',
    '',
  ].join('\n'))
}

function parseArgs(values) {
  const parsed = {
    apply: false,
    delivery: '',
    json: false,
    lessonId: '',
    log: '',
    manifest: '',
    recordedAt: '',
    url: '',
    verification: '',
    verifiedAt: '',
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--delivery') parsed.delivery = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--lesson') parsed.lessonId = values[++index] || ''
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--manifest') parsed.manifest = values[++index] || ''
    else if (value === '--recorded-at') parsed.recordedAt = values[++index] || ''
    else if (value === '--url') parsed.url = values[++index] || ''
    else if (value === '--verification') parsed.verification = values[++index] || ''
    else if (value === '--verified-at') parsed.verifiedAt = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

function validateArgs(value) {
  for (const field of ['lessonId', 'verifiedAt', 'url', 'verification']) {
    if (!value[field]) throw new Error(`--${field === 'lessonId' ? 'lesson' : field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} 不能为空。`)
  }
  if (value.lessonId !== 'L01') throw new Error('当前只有 L01 配置家庭练习卡。')
  if (Number.isNaN(Date.parse(value.verifiedAt))) throw new Error('--verified-at 不是有效时间。')
  if (value.recordedAt && Number.isNaN(Date.parse(value.recordedAt))) throw new Error('--recorded-at 不是有效时间。')
  if (value.verification.length < 12) throw new Error('--verification 必须说明具体主题中的附件可见证据。')
  if (!/(?:PDF|练习卡)[^\n]*(?:可见|可下载|附件)|(?:可见|可下载|附件)[^\n]*(?:PDF|练习卡)/.test(value.verification)) {
    throw new Error('--verification 必须明确说明练习卡 PDF 附件可见或可下载。')
  }
  const url = new URL(value.url)
  const isTopicDetail = url.hostname === 'wx.zsxq.com' && url.pathname.includes('/topic_detail/')
  const isTopicShareShortlink = url.hostname === 't.zsxq.com' && /^\/[A-Za-z0-9_-]{3,32}\/?$/.test(url.pathname)
  if (url.protocol !== 'https:' || url.search || url.hash || (!isTopicDetail && !isTopicShareShortlink)) {
    throw new Error('--url 必须是具体知识星球主题详情页或已核验主题分享短链，不能使用星球首页。')
  }
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'))
}

function renderHelp() {
  return `家庭练习卡附件证据登记\n\n用法：\n  node scripts/record-campaign-worksheet-delivery.mjs --lesson L01 --verified-at ISO --url TOPIC_URL --verification 说明 [--apply] [--json]\n\n默认只做 dry-run。必须先登记同一知识星球承接主题的真实公开 URL，并在具体主题中确认练习卡 PDF 附件可见或可下载；星球首页、编辑器上传状态或本地文件不能替代发布后证据。附件可见不计课程开始、完成或课程效果。\n`
}

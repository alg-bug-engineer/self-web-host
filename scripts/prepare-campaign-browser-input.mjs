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
const calendarFile = args.calendar
  ? path.resolve(projectDir, args.calendar)
  : await findCalendarContaining(args.calendarEntry)
const calendar = JSON.parse(await fs.readFile(calendarFile, 'utf8'))
const entry = calendar.entries.find((item) => item.id === args.calendarEntry)
if (!entry) throw new Error(`周历中不存在 ${args.calendarEntry}。`)
if (!['x', 'zsxq'].includes(entry.platform)) throw new Error('浏览器字段输入包只支持 X 与知识星球。')

const asset = selectAsset(entry, args.variant, args.asset)
if (!(entry.assets || []).includes(asset)) throw new Error(`${asset} 未绑定到周历条目 ${entry.id}。`)
const allowedDir = path.resolve(projectDir, 'content/campaigns/ai-native-generation-30d')
const assetFile = path.resolve(projectDir, asset)
if (!assetFile.startsWith(`${allowedDir}${path.sep}`) || !assetFile.endsWith('-publish.txt')) {
  throw new Error('浏览器输入只能读取本活动目录中的 -publish.txt。')
}

const source = await fs.readFile(assetFile, 'utf8')
if (!source.trim()) throw new Error(`${asset} 为空。`)
let payload = source
let destination = null
if (args.crosslinkDestination) {
  if (entry.platform !== 'x') throw new Error('--crosslink-destination 只适用于 X。')
  destination = validateZsxqDestination(args.crosslinkDestination)
  const matches = [...source.matchAll(/https:\/\/wx\.zsxq\.com\/[^\s]+/g)]
  if (matches.length !== 1) throw new Error(`X 载荷必须且只能包含 1 个知识星球链接，当前为 ${matches.length} 个。`)
  payload = source.replace(matches[0][0], destination.toString())
}

validatePublicPayload(payload, entry.platform)
const sourceSha256 = sha256(source)
const contentSha256 = sha256(payload)
const editorFields = entry.platform === 'zsxq'
  ? splitZsxqFields(payload, entry.title)
  : {
      text: payload.trim(),
      ...(args.variant === 'media' && entry.mediaAttachment?.altText
        ? { altText: validateAltText(entry.mediaAttachment.altText, entry.mediaAttachment.altTextSha256) }
        : {}),
    }

const result = {
  campaignId: calendar.campaignId,
  mode: 'read_only_browser_input',
  calendarEntryId: entry.id,
  platform: entry.platform,
  variant: args.variant,
  asset,
  sourceSha256,
  contentSha256,
  bytes: Buffer.byteLength(payload),
  ...(destination ? { crosslinkDestination: destination.toString() } : {}),
  ...(entry.platform === 'x' ? { weightedLength: xWeightedLength(payload.trim()) } : {}),
  ...(editorFields.altText ? { altTextSha256: sha256(editorFields.altText) } : {}),
  editorFields,
  writesPerformed: false,
  externalWritesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else process.stdout.write(renderMarkdown(result))

function parseArgs(values) {
  const parsed = { asset: '', calendar: '', calendarEntry: '', crosslinkDestination: '', json: false, variant: 'default' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--asset') parsed.asset = values[++index] || ''
    else if (value === '--calendar') parsed.calendar = values[++index] || ''
    else if (value === '--calendar-entry') parsed.calendarEntry = values[++index] || ''
    else if (value === '--crosslink-destination') parsed.crosslinkDestination = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--variant') parsed.variant = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (!parsed.calendarEntry) throw new Error('--calendar-entry 不能为空。')
  if (!new Set(['default', 'media']).has(parsed.variant)) throw new Error('--variant 只支持 default 或 media。')
  return parsed
}

function selectAsset(entry, variant, explicitAsset) {
  if (explicitAsset) return explicitAsset
  if (variant === 'media') {
    const mediaAsset = entry.mediaAttachment?.successPublishAsset
    if (!mediaAsset) throw new Error(`${entry.id} 没有媒体成功版纯载荷。`)
    return mediaAsset
  }
  return entry.mediaAttachment?.fallbackPublishAsset
    || (entry.assets || []).find((asset) => asset.endsWith('-publish.txt'))
    || (() => { throw new Error(`${entry.id} 没有纯发布载荷。`) })()
}

function splitZsxqFields(payload, expectedTitle) {
  const lines = payload.replace(/\r\n/g, '\n').split('\n')
  const titleIndex = lines.findIndex((line) => line.trim())
  if (titleIndex < 0) throw new Error('知识星球标题为空。')
  const title = lines[titleIndex].trim()
  const body = lines.slice(titleIndex + 1).join('\n').trim()
  if (title !== expectedTitle) throw new Error(`纯载荷标题与周历标题不一致：${title}`)
  if (!body) throw new Error('知识星球正文为空。')
  return { title, body }
}

function validatePublicPayload(value, platform) {
  if (/建议发布时间|可选首评|发布核验|回复模板|激活指标|后台设置|运营动作|首帖 24 小时执行卡/.test(value)) {
    throw new Error('纯载荷包含内部运营字段。')
  }
  if (platform === 'x' && xWeightedLength(value.trim()) > 280) {
    throw new Error(`X 纯载荷加权长度 ${xWeightedLength(value.trim())} 超过 280。`)
  }
}

function validateAltText(value, expectedSha256) {
  if (typeof value !== 'string' || value.trim().length < 20 || value.trim().length > 1000) {
    throw new Error('X 视频替代文本必须为 20—1000 字符。')
  }
  if (/建议发布时间|发布核验|回复模板|运营动作|真实学员案例|课程效果证明/.test(value)) {
    throw new Error('X 视频替代文本包含内部运营字段或不允许的效果表述。')
  }
  const altText = value.trim()
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 || '')) {
    throw new Error('X 视频周历缺少有效 altTextSha256。')
  }
  const actualSha256 = sha256(altText)
  if (actualSha256 !== expectedSha256) {
    throw new Error(`X 视频替代文本与周历摘要不一致；本地复算为 ${actualSha256}。`)
  }
  return altText
}

function validateZsxqDestination(value) {
  const url = new URL(value)
  const valid = url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash
    && ((url.hostname === 'wx.zsxq.com'
      && (url.pathname.startsWith('/group/') || url.pathname.includes('/topic_detail/')))
      || (url.hostname === 't.zsxq.com' && /^\/[A-Za-z0-9_-]{3,32}\/?$/.test(url.pathname)))
  if (!valid) throw new Error('--crosslink-destination 必须是无参数、无凭证的知识星球 HTTPS 链接。')
  return url
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

async function findCalendarContaining(entryId) {
  const directory = path.join(projectDir, 'ops', 'campaigns')
  const names = (await fs.readdir(directory))
    .filter((name) => /^ai-native-generation-30d-week\d+-content-calendar\.json$/.test(name))
    .sort()
  for (const name of names) {
    const filename = path.join(directory, name)
    const calendar = JSON.parse(await fs.readFile(filename, 'utf8'))
    if (calendar.entries?.some((entry) => entry.id === entryId)) return filename
  }
  throw new Error(`没有找到周历条目 ${entryId}。`)
}

function renderMarkdown(result) {
  return [
    '# 浏览器发布字段输入包',
    '',
    `- 条目：${result.calendarEntryId}`,
    `- 平台：${result.platform}`,
    `- 版本：${result.variant}`,
    `- 载荷：${result.asset}`,
    `- 最终 SHA-256：${result.contentSha256}`,
    `- 写入：无`,
    '',
    JSON.stringify(result.editorFields, null, 2),
    '',
  ].join('\n')
}

function renderHelp() {
  return [
    'X / 知识星球浏览器发布字段输入包（只读）',
    '',
    '用法：',
    '  node scripts/prepare-campaign-browser-input.mjs --calendar-entry <ID> [--variant default|media] [--asset <已绑定 -publish.txt>] [--crosslink-destination <知识星球 URL>] [--json]',
    '',
    'default 使用文字回退或首个纯载荷；media 只使用周历明确绑定的媒体成功版，并在 X 周历绑定替代文本时输出 editorFields.altText。工具只拆分已锁定 -publish.txt，不从母稿重新生成，不操作浏览器或外部平台。',
    '',
  ].join('\n')
}

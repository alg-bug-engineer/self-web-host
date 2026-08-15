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
if (!['x', 'zsxq'].includes(entry.platform)) throw new Error('只支持 X 与知识星球纯载荷。')
if (entry.status !== 'draft_ready') throw new Error(`${entry.id} 状态必须是 draft_ready。`)

const sourceAsset = (entry.assets || []).find((asset) => asset.endsWith('.md'))
if (!sourceAsset) throw new Error(`${entry.id} 缺少 Markdown 母稿。`)
const sourceFile = path.resolve(projectDir, sourceAsset)
const source = await fs.readFile(sourceFile, 'utf8')
const extracted = entry.platform === 'x'
  ? extractX(source)
  : extractZsxq(source, entry.title)
const payload = entry.platform === 'x'
  ? `${extracted.body.trim()}\n`
  : `${extracted.title.trim()}\n\n${extracted.body.trim()}\n`
validatePayload(payload, entry.platform)

const sourcePlatforms = new Set(calendar.entries
  .filter((item) => ['x', 'zsxq'].includes(item.platform) && (item.assets || []).includes(sourceAsset))
  .map((item) => item.platform))
const sharedDirectSource = sourcePlatforms.size > 1
const outputFile = args.output
  ? path.resolve(projectDir, args.output)
  : sourceFile.replace(/\.md$/i, sharedDirectSource ? `-${entry.platform}-publish.txt` : '-publish.txt')
const outputAsset = path.isAbsolute(sourceAsset)
  ? outputFile
  : path.relative(projectDir, outputFile)
const legacyOutputAsset = path.isAbsolute(sourceAsset)
  ? sourceFile.replace(/\.md$/i, '-publish.txt')
  : sourceAsset.replace(/\.md$/i, '-publish.txt')
const previousTitle = entry.title
const nextTitle = entry.platform === 'zsxq' ? extracted.title.trim() : entry.title
const existingPayload = await fs.readFile(outputFile, 'utf8').catch(() => null)
if (existingPayload !== null && existingPayload !== payload) {
  throw new Error(`${outputAsset} 已存在且内容不同；请人工审校，不自动覆盖。`)
}
const nextAssets = [outputAsset, ...(entry.assets || []).filter((asset) =>
  asset !== outputAsset && (!sharedDirectSource || asset !== legacyOutputAsset)
)]
const calendarChanged = entry.title !== nextTitle
  || JSON.stringify(entry.assets || []) !== JSON.stringify(nextAssets)
const payloadChanged = existingPayload !== payload
const result = {
  campaignId: calendar.campaignId,
  mode: args.apply ? 'apply' : 'dry_run',
  calendar: path.relative(projectDir, calendarFile),
  calendarEntry: entry.id,
  platform: entry.platform,
  sourceAsset,
  outputAsset,
  previousTitle,
  nextTitle,
  weightedLength: entry.platform === 'x' ? xWeightedLength(extracted.body.trim()) : null,
  payload,
  payloadChanged,
  calendarChanged,
  writesPerformed: false,
}

if (args.apply && (payloadChanged || calendarChanged)) {
  if (payloadChanged) await fs.writeFile(outputFile, payload, 'utf8')
  if (calendarChanged) {
    entry.title = nextTitle
    entry.assets = nextAssets
    await fs.writeFile(calendarFile, `${JSON.stringify(calendar, null, 2)}\n`, 'utf8')
  }
  result.writesPerformed = true
}

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  process.stdout.write([
    '# 单平台纯发布载荷',
    '',
    `- 模式：${result.mode}`,
    `- 条目：${entry.id}`,
    `- 平台：${entry.platform}`,
    `- 母稿：${sourceAsset}`,
    `- 纯载荷：${outputAsset}`,
    `- 标题：${nextTitle}`,
    ...(result.weightedLength == null ? [] : [`- X 加权长度：${result.weightedLength} / 280`]),
    `- 已写入：${result.writesPerformed ? '是' : '否'}`,
    '',
    '> 默认 dry_run；只有显式 --apply 才写入纯载荷并更新周历。此工具不操作外部平台。',
    '',
    payload,
  ].join('\n'))
}

function extractX(markdown) {
  const body = sectionBody(markdown, '## 主帖')
    || sectionBody(markdown, '## X')
    || markdown.replace(/^# .+\n\n?/, '').trim()
  if (!body) throw new Error('X 母稿没有可提取正文。')
  if (/^##? /m.test(body)) throw new Error('X 母稿包含多个发布分支或内部章节，需要人工选择后再生成纯载荷。')
  return { body }
}

function extractZsxq(markdown, fallbackTitle) {
  if (/^## (公开复盘稿|下一周决策)$/m.test(markdown)) {
    throw new Error('知识星球母稿包含数据分支，需要根据真实指标人工选择公开版本。')
  }
  const distribution = sectionBody(markdown, '## 知识星球')
  if (distribution) {
    const title = subsectionBody(distribution, '### 标题')
    const body = subsectionBody(distribution, '### 正文')
    if (!title || !body) throw new Error('分发包中的知识星球标题或正文缺失。')
    return { title: firstContentLine(title), body }
  }
  const titleSection = sectionBody(markdown, '## 标题')
  if (titleSection) {
    const title = firstContentLine(titleSection)
    const explicitBody = sectionBody(markdown, '## 正文')
    if (explicitBody) return { title, body: explicitBody }
    const inlineBody = contentAfterFirstLine(titleSection)
    const titleEnd = markdown.indexOf('\n## ', markdown.indexOf('## 标题') + '## 标题'.length)
    const following = titleEnd < 0 ? '' : cutAtInternalZsxqHeading(markdown.slice(titleEnd + 1))
    const body = [inlineBody, following].filter(Boolean).join('\n\n').trim()
    if (!body) throw new Error('知识星球标题后缺少公开正文。')
    return { title, body }
  }
  const body = cutAtInternalZsxqHeading(markdown.replace(/^# .+\n\n?/, '').trim())
  if (!body) throw new Error('知识星球母稿没有可提取正文。')
  return { title: fallbackTitle, body }
}

function sectionBody(markdown, heading) {
  const start = markdown.indexOf(`${heading}\n`)
  if (start < 0) return ''
  const bodyStart = start + heading.length + 1
  const next = markdown.indexOf('\n## ', bodyStart)
  return markdown.slice(bodyStart, next < 0 ? markdown.length : next).trim()
}

function subsectionBody(markdown, heading) {
  const start = markdown.indexOf(`${heading}\n`)
  if (start < 0) return ''
  const bodyStart = start + heading.length + 1
  const nextSubsection = markdown.indexOf('\n### ', bodyStart)
  const nextSection = markdown.indexOf('\n## ', bodyStart)
  const candidates = [nextSubsection, nextSection].filter((value) => value >= 0)
  const end = candidates.length ? Math.min(...candidates) : markdown.length
  return markdown.slice(bodyStart, end).trim()
}

function firstContentLine(value) {
  const line = value.split('\n').map((item) => item.trim()).find(Boolean)
  if (!line) throw new Error('公开标题为空。')
  return line.replace(/^#+\s*/, '')
}

function contentAfterFirstLine(value) {
  const lines = value.split('\n')
  const index = lines.findIndex((item) => item.trim().length > 0)
  return index < 0 ? '' : lines.slice(index + 1).join('\n').trim()
}

function cutAtInternalZsxqHeading(value) {
  const internal = /^## (星主|回复模板|激活指标|指标|记录指标|后台|运营|计数口径|有效.*口径|完成口径|公开授权|发布设置)/m
  const match = internal.exec(value)
  return value.slice(0, match?.index ?? value.length).trim()
}

function validatePayload(value, platform) {
  if (!value.trim()) throw new Error('纯发布载荷为空。')
  const forbidden = /建议发布时间|可选首评|发布核验|回复模板|激活指标|后台设置|运营动作/
  if (forbidden.test(value)) throw new Error('纯发布载荷仍包含内部字段。')
  if (/^## (星主|记录指标|指标|后台|运营|计数口径|有效.*口径|完成口径|公开授权|发布设置)/m.test(value)) {
    throw new Error('纯发布载荷仍包含知识星球内部章节。')
  }
  if (platform === 'x' && xWeightedLength(value.trim()) > 280) {
    throw new Error(`X 纯载荷加权长度 ${xWeightedLength(value.trim())} 超过 280。`)
  }
  if (platform === 'zsxq') {
    const [title, , ...body] = value.split('\n')
    if (!title?.trim() || body.join('\n').trim().length === 0) throw new Error('知识星球纯载荷必须包含标题和正文。')
  }
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

function parseArgs(values) {
  const parsed = { apply: false, calendar: '', calendarEntry: '', json: false, output: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--calendar') parsed.calendar = values[++index] || ''
    else if (value === '--calendar-entry') parsed.calendarEntry = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--output') parsed.output = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (!parsed.calendarEntry) throw new Error('--calendar-entry 不能为空。')
  return parsed
}

function renderHelp() {
  return [
    'X / 知识星球单平台纯发布载荷准备器',
    '',
    '用法：',
    '  node scripts/prepare-campaign-publish-payload.mjs --calendar-entry <周历条目 ID> [选项]',
    '',
    '选项：',
    '  --calendar <周历文件>  指定周历；默认按条目 ID 查找',
    '  --output <输出文件>  指定 -publish.txt 路径',
    '  --json  输出 JSON 和完整候选载荷',
    '  --apply  写入纯载荷并更新周历；省略时只做 dry-run',
    '  --help, -h  显示帮助',
    '',
    '数据复盘含多个公开分支时会拒绝自动选择；必须先根据真实指标确定版本。此工具不操作外部平台。',
    '',
  ].join('\n')
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

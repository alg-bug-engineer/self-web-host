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
const metricsFile = path.resolve(
  projectDir,
  args.metricsFile || 'ops/campaigns/ai-native-generation-30d-cross-platform-metrics.json',
)
const logFile = path.resolve(
  projectDir,
  args.log || 'ops/campaigns/ai-native-generation-30d-log.json',
)
const [store, log] = await Promise.all([readJson(metricsFile), readJson(logFile)])
validateStore(store)
validateArgs(args, store)

const publications = (log.dailyRuns || []).flatMap((run) => run.externalPublishes || [])
const publication = publications.find((item) => item.calendarEntryId === args.calendarEntry)
if (!publication) throw new Error(`缺少 ${args.calendarEntry} 的已登记公开证据。`)
if (publication.platform !== args.platform) throw new Error('发布证据平台与 --platform 不一致。')
if (publication.url !== args.url) throw new Error('指标 URL 必须与已登记公开证据完全一致。')
validatePlatformUrl(args.platform, args.url)

const metricFields = store.metricFields[args.platform]
const metrics = Object.fromEntries(metricFields.map((field) => [field, args.metrics[field]]))
const previous = [...store.snapshots]
  .reverse()
  .find((item) => item.calendarEntryId === args.calendarEntry)
if (previous && previous.url !== args.url) throw new Error('同一周历条目不得切换公开 URL。')
if (previous && previous.capturedAt >= args.capturedAt) throw new Error('新快照时间必须晚于同一条目的上一快照。')
for (const field of metricFields) {
  const before = previous?.metrics?.[field]
  const after = metrics[field]
  if (Number.isInteger(before) && Number.isInteger(after) && after < before) {
    throw new Error(`${field} 不能小于上一快照；如平台纠正数字，先人工复核并保留说明。`)
  }
}

const snapshot = {
  calendarEntryId: args.calendarEntry,
  platform: args.platform,
  title: publication.title,
  url: args.url,
  publishedAt: publication.publishedAt,
  capturedAt: args.capturedAt,
  evidence: args.evidence,
  metrics,
  privacy: {
    containsMemberIdentity: false,
    containsChildData: false,
    credentialsAccessed: false,
  },
}
store.snapshots.push(snapshot)

const result = {
  campaignId: store.campaignId,
  mode: args.apply ? 'apply' : 'dry_run',
  snapshot,
  previousSnapshotAt: previous?.capturedAt || null,
  writesPerformed: false,
}

if (args.apply) {
  await fs.writeFile(metricsFile, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  result.writesPerformed = true
}

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else process.stdout.write(renderMarkdown(result))

function parseArgs(values) {
  const parsed = {
    apply: false,
    calendarEntry: '',
    capturedAt: '',
    evidence: '',
    json: false,
    log: '',
    metrics: {},
    metricsFile: '',
    platform: '',
    url: '',
  }
  const metricNames = new Set([
    'views', 'replies', 'reposts', 'likes', 'bookmarks', 'linkClicks',
    'reads', 'comments', 'favorites', 'impressions',
  ])
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--calendar-entry') parsed.calendarEntry = values[++index] || ''
    else if (value === '--captured-at') parsed.capturedAt = values[++index] || ''
    else if (value === '--evidence') parsed.evidence = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--metrics-file') parsed.metricsFile = values[++index] || ''
    else if (value === '--platform') parsed.platform = values[++index] || ''
    else if (value === '--url') parsed.url = values[++index] || ''
    else if (value.startsWith('--') && metricNames.has(value.slice(2))) {
      parsed.metrics[value.slice(2)] = parseMetric(values[++index])
    } else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

function parseMetric(value) {
  if (value === 'unknown' || value === 'null') return null
  if (!/^\d+$/.test(value || '')) throw new Error(`指标必须是非负整数、unknown 或 null：${value || '空'}`)
  return Number(value)
}

function validateStore(store) {
  if (store.version !== 1 || store.campaignId !== 'ai-native-generation-30d') {
    throw new Error('跨平台指标文件版本或 campaignId 无效。')
  }
  if (!store.metricFields || !Array.isArray(store.snapshots)) throw new Error('跨平台指标文件结构无效。')
}

function validateArgs(args, store) {
  if (!store.metricFields[args.platform]) throw new Error('--platform 只支持 x、csdn、toutiao、zsxq。')
  if (!args.calendarEntry) throw new Error('缺少 --calendar-entry。')
  if (!/^https:\/\//.test(args.url)) throw new Error('--url 必须是 HTTPS。')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?[+-]\d{2}:\d{2}$/.test(args.capturedAt)) {
    throw new Error('--captured-at 必须是带时区偏移的 ISO 时间。')
  }
  if (!['visible_public_page', 'authenticated_visible_aggregate_ui'].includes(args.evidence)) {
    throw new Error('--evidence 必须是 visible_public_page 或 authenticated_visible_aggregate_ui。')
  }
  const expected = store.metricFields[args.platform]
  const supplied = Object.keys(args.metrics)
  const missing = expected.filter((field) => !supplied.includes(field))
  const extra = supplied.filter((field) => !expected.includes(field))
  if (missing.length) throw new Error(`缺少指标：${missing.join(', ')}；未知值也必须显式写 unknown。`)
  if (extra.length) throw new Error(`${args.platform} 不支持指标：${extra.join(', ')}`)
}

function validatePlatformUrl(platform, value) {
  const hostname = new URL(value).hostname.toLowerCase()
  const allowedHosts = {
    x: ['x.com', 'twitter.com'],
    csdn: ['blog.csdn.net'],
    toutiao: ['www.toutiao.com', 'toutiao.com'],
    zsxq: ['wx.zsxq.com', 't.zsxq.com'],
  }
  if (!allowedHosts[platform].includes(hostname)) throw new Error(`${platform} URL 域名不匹配。`)
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'))
}

function renderMarkdown(result) {
  return [
    '# 跨平台指标快照',
    '',
    `- 模式：${result.mode}`,
    `- 平台：${result.snapshot.platform}`,
    `- 周历条目：${result.snapshot.calendarEntryId}`,
    `- 捕获时间：${result.snapshot.capturedAt}`,
    `- 指标：${JSON.stringify(result.snapshot.metrics)}`,
    `- 写入：${result.writesPerformed ? '是' : '否'}`,
    '',
  ].join('\n')
}

function renderHelp() {
  return [
    '跨平台公开指标快照登记',
    '',
    '必须先通过发布登记器保存 calendarEntryId 与真实公开 URL。每个平台的全部指标都要显式提供；不可见或无法确认写 unknown。',
    '',
    '示例：',
    '  node scripts/record-campaign-cross-platform-snapshot.mjs \\',
    '    --platform x --calendar-entry w1-x-01 --url https://x.com/example/status/1 \\',
    '    --captured-at 2026-08-12T20:00:00+08:00 --evidence visible_public_page \\',
    '    --views 3 --replies 0 --reposts 0 --likes 0 --bookmarks 0 --linkClicks unknown [--apply] [--json]',
    '',
  ].join('\n')
}

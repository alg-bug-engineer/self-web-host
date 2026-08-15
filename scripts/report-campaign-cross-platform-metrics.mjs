import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const asOf = args.asOf || shanghaiDateKey()
const metricsFile = path.resolve(
  projectDir,
  args.metricsFile || 'ops/campaigns/ai-native-generation-30d-cross-platform-metrics.json',
)
const store = JSON.parse(await fs.readFile(metricsFile, 'utf8'))
const cutoff = `${asOf}T23:59:59+08:00`
const snapshots = store.snapshots.filter((item) => item.capturedAt <= cutoff)
const groups = new Map()
for (const snapshot of snapshots) {
  const values = groups.get(snapshot.calendarEntryId) || []
  values.push(snapshot)
  groups.set(snapshot.calendarEntryId, values)
}
const items = [...groups.entries()].map(([calendarEntryId, values]) => {
  const ordered = [...values].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
  const first = ordered[0]
  const latest = ordered.at(-1)
  const deltas = Object.fromEntries(store.metricFields[latest.platform].map((field) => {
    const start = first.metrics[field]
    const end = latest.metrics[field]
    return [field, ordered.length >= 2 && Number.isInteger(start) && Number.isInteger(end) ? end - start : null]
  }))
  return {
    calendarEntryId,
    platform: latest.platform,
    title: latest.title,
    url: latest.url,
    firstCapturedAt: first.capturedAt,
    latestCapturedAt: latest.capturedAt,
    snapshotCount: ordered.length,
    comparable: ordered.length >= 2,
    firstMetrics: first.metrics,
    latestMetrics: latest.metrics,
    deltas,
    unknownLatestMetrics: Object.entries(latest.metrics)
      .filter(([, value]) => value == null)
      .map(([field]) => field),
  }
}).sort((left, right) => left.firstCapturedAt.localeCompare(right.firstCapturedAt))

const byPlatform = Object.fromEntries(Object.keys(store.metricFields).map((platform) => {
  const platformItems = items.filter((item) => item.platform === platform)
  return [platform, {
    items: platformItems.length,
    snapshots: platformItems.reduce((sum, item) => sum + item.snapshotCount, 0),
    comparableItems: platformItems.filter((item) => item.comparable).length,
  }]
}))

const report = {
  campaignId: store.campaignId,
  asOf,
  state: items.length ? 'observed' : 'awaiting_first_snapshot',
  countingPolicy: store.countingPolicy,
  coverage: {
    items: items.length,
    snapshots: snapshots.length,
    comparableItems: items.filter((item) => item.comparable).length,
    itemsWithUnknownLatestMetrics: items.filter((item) => item.unknownLatestMetrics.length).length,
  },
  byPlatform,
  items,
  interpretation: [
    '只解释同一 calendarEntryId、同一公开 URL 的首末变化。',
    '任一端为未知时差值保持 null；不得把未知补成 0。',
    '不同平台或内容的曝光、阅读和浏览不相加为独立人数，也不等于知识星球活跃、付费或课程内测转化。',
    'X linkClicks 仅作为该状态的原生出站点击证据；不可见时保持 null，也不把它直接写入知识星球付费页访问或加入点击。',
  ],
  externalWritesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))

function parseArgs(values) {
  const parsed = { asOf: '', json: false, metricsFile: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--metrics-file') parsed.metricsFile = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.asOf)) throw new Error('--as-of 必须是 YYYY-MM-DD。')
  return parsed
}

function renderMarkdown(report) {
  const lines = [
    '# 跨平台同 URL 指标复盘',
    '',
    `- 截止：${report.asOf}`,
    `- 状态：${report.state}`,
    `- 内容 / 快照 / 可比内容：${report.coverage.items} / ${report.coverage.snapshots} / ${report.coverage.comparableItems}`,
    '',
  ]
  for (const item of report.items) {
    lines.push(
      `## ${item.platform}｜${item.title}`,
      '',
      `- URL：${item.url}`,
      `- 首次：${item.firstCapturedAt}｜${JSON.stringify(item.firstMetrics)}`,
      `- 最近：${item.latestCapturedAt}｜${JSON.stringify(item.latestMetrics)}`,
      `- 差值：${JSON.stringify(item.deltas)}`,
      `- 未知：${item.unknownLatestMetrics.length ? item.unknownLatestMetrics.join(', ') : '无'}`,
      '',
    )
  }
  lines.push('## 解释边界', '', ...report.interpretation.map((item) => `- ${item}`), '')
  return `${lines.join('\n')}\n`
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

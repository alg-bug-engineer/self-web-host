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
const queueFile = path.resolve(projectDir, args.queue || 'ops/campaigns/ai-native-generation-30d-research-queue.json')
const evidenceMapFile = path.resolve(projectDir, args.evidenceMap || 'ops/campaigns/ai-native-generation-30d-course-evidence-map.json')
const logFile = path.resolve(projectDir, args.log || 'ops/campaigns/ai-native-generation-30d-log.json')
const [queue, evidenceMap, log] = await Promise.all([
  readJson(queueFile),
  readJson(evidenceMapFile),
  readJson(logFile),
])

const task = (queue.tasks || []).find((item) => item.id === args.taskId)
if (!task) throw new Error(`研究队列中不存在 ${args.taskId}`)
if (task.status === 'completed_verified') throw new Error(`${args.taskId} 已登记为 completed_verified`)
if (args.completedAt.slice(0, 10) < task.dueOn) throw new Error('研究任务不得在 dueOn 之前登记完成')
const expectedSources = [...task.sourceIds].sort()
const verifiedSources = [...new Set(args.verifiedSources)].sort()
if (JSON.stringify(verifiedSources) !== JSON.stringify(expectedSources)) {
  throw new Error(`--verified-source 必须完整且仅包含 ${expectedSources.join('、')}`)
}
if (args.apply && (!args.sourceCitationsVerified || !args.privacyVerified)) {
  throw new Error('--apply 要求同时使用 --source-citations-verified 与 --privacy-verified')
}
if (task.mustReverifyOnline && !args.onlineReverifiedAt) {
  throw new Error(`${task.id} 要求 --online-reverified-at`)
}
if (args.onlineReverifiedAt && args.onlineReverifiedAt.slice(0, 10) < task.dueOn) {
  throw new Error('--online-reverified-at 不能早于任务 dueOn')
}

const outputAsset = task.outputAssets?.[0]
if (!outputAsset) throw new Error(`${task.id} 缺少目标输出文件`)
const outputPath = path.resolve(projectDir, outputAsset)
const output = await fs.readFile(outputPath, 'utf8').catch(() => '')
if (!output) throw new Error(`研究输出不存在：${outputAsset}`)
if (output.length < 1500) throw new Error('研究输出过短，不能登记为 completed_verified')
const sourceById = new Map((evidenceMap.sources || []).map((source) => [source.id, source]))
for (const sourceId of expectedSources) {
  const source = sourceById.get(sourceId)
  if (!source?.url || !output.includes(source.url)) throw new Error(`研究输出缺少 ${sourceId} 原始来源链接`)
}
for (const marker of ['研究范围与来源', '来源支持', '课程教学假设', '仍未知', '禁止公开']) {
  if (!output.includes(marker)) throw new Error(`研究输出缺少结构：${marker}`)
}

const outputSha256 = crypto.createHash('sha256').update(output).digest('hex')
task.status = 'completed_verified'
task.completedAt = new Date(args.completedAt).toISOString()
task.result = {
  outputAsset,
  outputSha256,
  verifiedSourceIds: verifiedSources,
  sourceCitationsVerified: args.sourceCitationsVerified,
  privacyVerified: args.privacyVerified,
  containsChildData: false,
  publicFactGate: 'primary_sources_required',
  ...(args.onlineReverifiedAt ? { onlineReverifiedAt: new Date(args.onlineReverifiedAt).toISOString() } : {}),
}

const dateKey = args.completedAt.slice(0, 10)
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
dailyRun.outputs.push(`NotebookLM ${task.id} 限定来源研究输出已完成核验：${outputAsset}`)
dailyRun.notes.push(`${task.id} 只登记来源引用与隐私门禁均经人工核验的研究输出；NotebookLM 笔记本身不作为公开事实来源。`)
log.updatedAt = args.recordedAt || new Date().toISOString()

const result = {
  campaignId: queue.campaignId,
  mode: args.apply ? 'apply' : 'dry_run',
  taskId: task.id,
  previousStatus: 'planned',
  status: task.status,
  completedAt: task.completedAt,
  outputAsset,
  outputSha256,
  verifiedSourceIds: verifiedSources,
  sourceCitationsVerified: args.sourceCitationsVerified,
  privacyVerified: args.privacyVerified,
  externalWritesPerformed: false,
  writesPerformed: false,
}

if (args.apply) {
  await Promise.all([
    fs.writeFile(queueFile, `${JSON.stringify(queue, null, 2)}\n`, 'utf8'),
    fs.writeFile(logFile, `${JSON.stringify(log, null, 2)}\n`, 'utf8'),
  ])
  result.writesPerformed = true
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

function parseArgs(values) {
  const parsed = {
    apply: false,
    completedAt: '',
    evidenceMap: '',
    json: false,
    log: '',
    onlineReverifiedAt: '',
    privacyVerified: false,
    queue: '',
    recordedAt: '',
    sourceCitationsVerified: false,
    taskId: '',
    verifiedSources: [],
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--completed-at') parsed.completedAt = values[++index] || ''
    else if (value === '--evidence-map') parsed.evidenceMap = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--online-reverified-at') parsed.onlineReverifiedAt = values[++index] || ''
    else if (value === '--privacy-verified') parsed.privacyVerified = true
    else if (value === '--queue') parsed.queue = values[++index] || ''
    else if (value === '--recorded-at') parsed.recordedAt = values[++index] || ''
    else if (value === '--source-citations-verified') parsed.sourceCitationsVerified = true
    else if (value === '--task') parsed.taskId = values[++index] || ''
    else if (value === '--verified-source') parsed.verifiedSources.push(values[++index] || '')
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

function validateArgs(value) {
  if (!/^R\d{2}$/.test(value.taskId)) throw new Error('--task 必须为 R00—R99')
  if (!value.completedAt || Number.isNaN(Date.parse(value.completedAt))) throw new Error('--completed-at 必须是有效时间')
  if (value.recordedAt && Number.isNaN(Date.parse(value.recordedAt))) throw new Error('--recorded-at 必须是有效时间')
  if (value.onlineReverifiedAt && Number.isNaN(Date.parse(value.onlineReverifiedAt))) throw new Error('--online-reverified-at 必须是有效时间')
  if (!value.verifiedSources.length || value.verifiedSources.some((item) => !/^S\d{2}$/.test(item))) {
    throw new Error('--verified-source 至少提供一个有效来源 ID')
  }
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'))
}

function renderHelp() {
  return `NotebookLM 研究交付登记\n\n用法：\n  node scripts/record-campaign-research-task.mjs --task R01 --completed-at ISO --verified-source S02 ... [--source-citations-verified] [--privacy-verified] [--apply]\n\n默认 dry-run。目标输出文件必须存在并包含全部限定来源链接、研究范围、来源支持、课程教学假设、仍未知和禁止公开结构。只有人工确认逐条引用与隐私边界后才能同时使用 --source-citations-verified、--privacy-verified 和 --apply。NotebookLM 笔记不直接作为公开事实来源。\n`
}

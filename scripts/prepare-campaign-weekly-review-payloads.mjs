import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { evaluateWeeklyExperiment, normalizeAsOf } from './lib/campaign-weekly-experiments.mjs'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const configs = {
  1: {
    date: '2026-08-18',
    title: '第一周公开复盘',
    stageLabels: ['明确开始', '有效完成'],
    outputs: [
      { platform: 'x', filename: '2026-08-18-x-week1-review-publish.txt' },
      { platform: 'zsxq', filename: '2026-08-18-week1-review-publish.txt' },
    ],
  },
  2: {
    date: '2026-08-25',
    title: '第二周公开复盘',
    stageLabels: ['开始挑战', '进入 Day 2', '完成挑战'],
    outputs: [
      { platform: 'x', filename: '2026-08-25-x-week2-review-publish.txt' },
      { platform: 'zsxq', filename: '2026-08-25-week2-review-publish.txt' },
    ],
  },
  4: {
    date: '2026-09-08',
    title: '第四周安全、公约与终课复盘',
    stageLabels: ['完成安全门', '完成家庭公约', '完成终课答辩'],
    outputs: [
      { platform: 'zsxq', filename: '2026-09-08-week4-review-publish.txt' },
    ],
  },
}
const config = configs[args.week]
if (!config) throw new Error('--week 只支持 1、2、4。')
const asOf = normalizeAsOf(args.asOf || `${config.date}T20:00:00+08:00`)
const [registry, metrics] = await Promise.all([
  readJson(args.registry || 'ops/campaigns/ai-native-generation-30d-weekly-experiments.json'),
  readJson(args.metrics || 'ops/campaigns/ai-native-generation-30d-zsxq-metrics.json'),
])
const report = evaluateWeeklyExperiment(registry, metrics, asOf)
const outputDir = path.resolve(
  projectDir,
  args.outputDir || 'content/campaigns/ai-native-generation-30d',
)

if (!report.experiment || report.experiment.week !== args.week) {
  emit({
    campaignId: registry.campaignId,
    week: args.week,
    asOf,
    state: Date.parse(asOf) < Date.parse(`${config.date}T20:00:00+08:00`) ? 'not_due' : 'wrong_experiment_window',
    weeklyExperimentState: report.state,
    outputs: [],
    writesPerformed: false,
    externalWritesPerformed: false,
  })
  process.exit(0)
}

if (Date.parse(asOf) < Date.parse(report.experiment.decisionAt)) {
  emit({
    campaignId: registry.campaignId,
    week: args.week,
    asOf,
    state: 'not_due',
    weeklyExperimentState: report.state,
    decisionAt: report.experiment.decisionAt,
    outputs: [],
    writesPerformed: false,
    externalWritesPerformed: false,
  })
  process.exit(0)
}

if (report.decisionAllowed) {
  emit({
    campaignId: registry.campaignId,
    week: args.week,
    asOf,
    state: 'awaiting_branch_record',
    weeklyExperimentState: report.state,
    recommendedBranch: report.recommendedBranch?.id || null,
    recordCommand: `node scripts/record-campaign-weekly-experiment.mjs --week ${args.week} --branch ${report.recommendedBranch.id} --decided-at ${report.asOf} --evidence-snapshot ${report.evidence.capturedAt} --apply --json`,
    outputs: [],
    writesPerformed: false,
    externalWritesPerformed: false,
  })
  process.exit(0)
}

const nextAction = report.state === 'decided' && report.recommendedBranch
  ? report.recommendedBranch.nextWeekAction
  : '决策证据不足；下一周保持原计划，不调整任务结构或同时引入第二个变量。'
const evidence = report.evidence || null
const generated = config.outputs.map((output) => {
  const content = output.platform === 'x'
    ? buildX(config, evidence, nextAction)
    : buildZsxq(config, evidence, nextAction, report.reason)
  if (/【|__|待后台核验|待人工去重|待交易后台核验|待核验/.test(content)) {
    throw new Error(`${output.filename} 仍含占位符或未核验占位文本。`)
  }
  if (output.platform === 'x' && [...content].length > 280) {
    throw new Error(`${output.filename} 超过 280 字符。`)
  }
  return {
    platform: output.platform,
    file: path.relative(projectDir, path.join(outputDir, output.filename)),
    content,
    contentSha256: crypto.createHash('sha256').update(content).digest('hex'),
  }
})

if (args.apply) {
  await fs.mkdir(outputDir, { recursive: true })
  for (const output of generated) {
    await fs.writeFile(path.resolve(projectDir, output.file), output.content, { encoding: 'utf8', flag: 'wx' })
  }
}

emit({
  campaignId: registry.campaignId,
  week: args.week,
  asOf,
  state: report.state === 'decided' ? 'draft_ready_decided' : 'draft_ready_evidence_limited',
  weeklyExperimentState: report.state,
  evidenceCapturedAt: evidence?.capturedAt || null,
  nextAction,
  outputs: generated,
  publicationGate: 'published=false；必须刷新 20:00 运营包并逐条取得真实公开 URL。',
  writesPerformed: args.apply,
  externalWritesPerformed: false,
})

function buildX(value, evidenceValue, nextActionValue) {
  const counts = stageCounts(value, evidenceValue)
  const countSentence = counts
    ? `${value.stageLabels.map((label, index) => `${label} ${counts[index]}`).join('，')}。`
    : '决策时点缺少已核验周快照，因此不报告家庭数或完成率。'
  return `儿童 AI 素养试运行第${chineseWeek(args.week)}周复盘：${countSentence}\n\n阅读和跨平台曝光不代替家庭行动。${nextActionValue}\n\n只报告去标识化汇总，不公开儿童或家庭资料。\n`
}

function buildZsxq(value, evidenceValue, nextActionValue, reason) {
  const counts = stageCounts(value, evidenceValue)
  const metrics = counts
    ? value.stageLabels.map((label, index) => `- ${label}：${counts[index]} 个去重家庭`).join('\n')
    : `- 决策时点没有满足口径的已核验周快照\n- 不用阅读、点赞或跨平台曝光补家庭分母\n- 证据状态：${reason}`
  return `${value.title}\n\n本周只复盘可核验家庭行动，不用内容数量或曝光替代课程证据。\n\n${metrics}\n\n下一步只做一件事：${nextActionValue}\n\n没有可靠开始人数时不计算完成率。知识星球付费、课程内测意向和课程付费分别记录；任务提交不自动构成公开案例授权。\n\n本复盘不公开儿童姓名、学校、位置、照片、声音、账号、聊天、健康资料或原始作品。\n`
}

function stageCounts(value, evidenceValue) {
  if (!evidenceValue?.stageMetrics) return null
  const order = ['started', 'middle', 'completed'].filter((key) => evidenceValue.stageMetrics[key])
  const counts = order.map((key) => evidenceValue.stageMetrics[key].value)
  if (counts.length !== value.stageLabels.length || counts.some((count) => !Number.isInteger(count) || count < 0)) return null
  return counts
}

function chineseWeek(value) {
  return { 1: '一', 2: '二', 4: '四' }[value]
}

function parseArgs(values) {
  const parsed = { apply: false, asOf: '', json: false, metrics: '', outputDir: '', registry: '', week: 0 }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--metrics') parsed.metrics = values[++index] || ''
    else if (value === '--output-dir') parsed.outputDir = values[++index] || ''
    else if (value === '--registry') parsed.registry = values[++index] || ''
    else if (value === '--week') parsed.week = Number(values[++index])
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(path.resolve(projectDir, filename), 'utf8'))
}

function emit(value) {
  process.stdout.write(args.json ? `${JSON.stringify(value, null, 2)}\n` : `${value.state}\n`)
}

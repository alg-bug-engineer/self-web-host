import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { evaluateWeeklyExperiment } from './lib/campaign-weekly-experiments.mjs'

const args = parseArgs(process.argv.slice(2))
const projectDir = process.cwd()
const [registry, metrics] = await Promise.all([
  readJson(args.registry || 'ops/campaigns/ai-native-generation-30d-weekly-experiments.json'),
  readJson(args.metrics || 'ops/campaigns/ai-native-generation-30d-zsxq-metrics.json'),
])
const report = {
  campaignId: registry.campaignId,
  ...evaluateWeeklyExperiment(registry, metrics, args.asOf),
  policy: registry.policy,
  recordCommand: null,
  externalWritesPerformed: false,
}
if (report.decisionAllowed) {
  report.recordCommand = `node scripts/record-campaign-weekly-experiment.mjs --week ${report.experiment.week} --branch ${report.recommendedBranch.id} --decided-at ${report.asOf} --evidence-snapshot ${report.evidence.capturedAt} --apply --json`
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))

function parseArgs(values) {
  const parsed = { asOf: '', json: false, metrics: '', registry: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--metrics') parsed.metrics = values[++index] || ''
    else if (value === '--registry') parsed.registry = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(path.resolve(projectDir, filename), 'utf8'))
}

function renderMarkdown(report) {
  const branch = report.recommendedBranch
  return `# 周实验决策报告\n\n- 状态：${report.state}\n- 决策允许：${report.decisionAllowed ? '是' : '否'}\n- 原因：${report.reason}\n- 建议分支：${branch?.id || '无'}\n- 唯一变量：${branch?.changedVariable || '不调整'}\n- 下一步：${branch?.nextWeekAction || '继续采集，不改下一周内容'}\n`
}

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { evaluateWeeklyExperiment, findBranch } from './lib/campaign-weekly-experiments.mjs'

const args = parseArgs(process.argv.slice(2))
const projectDir = process.cwd()
const registryFile = path.resolve(projectDir, args.registry || 'ops/campaigns/ai-native-generation-30d-weekly-experiments.json')
const metricsFile = path.resolve(projectDir, args.metrics || 'ops/campaigns/ai-native-generation-30d-zsxq-metrics.json')
const [registry, metrics] = await Promise.all([
  fs.readFile(registryFile, 'utf8').then(JSON.parse),
  fs.readFile(metricsFile, 'utf8').then(JSON.parse),
])
const experiment = registry.experiments.find((item) => item.week === args.week)
if (!experiment) throw new Error(`没有第 ${args.week} 周实验。`)
const evaluation = evaluateWeeklyExperiment(registry, metrics, args.decidedAt)
if (evaluation.experiment?.week !== args.week) throw new Error('decided-at 不在指定周实验窗口内。')
if (!evaluation.decisionAllowed) throw new Error(`当前不允许登记决策：${evaluation.reason}`)
if (evaluation.evidence?.capturedAt !== args.evidenceSnapshot) throw new Error('evidence-snapshot 必须与报告使用的最新核验快照完全一致。')
const selected = findBranch(experiment, args.branch)
if (selected.id !== evaluation.recommendedBranch.id && !args.overrideReason) {
  throw new Error(`分支与证据建议不一致；如经人工复核仍选择该分支，必须提供 --override-reason。`)
}
if (args.overrideReason && args.overrideReason.trim().length < 12) throw new Error('--override-reason 至少 12 个字符。')

const decision = {
  id: selected.id,
  decidedAt: evaluation.asOf,
  changedVariable: selected.changedVariable,
  nextWeekAction: selected.nextWeekAction,
  primaryMetric: selected.primaryMetric,
  overrideReason: args.overrideReason || null,
}
experiment.status = 'decided'
experiment.selectedBranch = decision
experiment.decisionEvidence = evaluation.evidence
const nextExperiment = registry.experiments.find((item) => item.week === experiment.week + 1)
if (nextExperiment && selected.nextExperiment) {
  if (nextExperiment.selectedBranch || nextExperiment.currentExperiment) {
    throw new Error(`第 ${nextExperiment.week} 周实验已初始化，拒绝覆盖。`)
  }
  nextExperiment.currentExperiment = selected.nextExperiment
  nextExperiment.status = 'collecting'
}

if (args.apply) await fs.writeFile(registryFile, `${JSON.stringify(registry, null, 2)}\n`)
const result = {
  campaignId: registry.campaignId,
  week: args.week,
  decision,
  evidence: evaluation.evidence,
  nextExperiment: nextExperiment?.currentExperiment || null,
  writesPerformed: args.apply,
}
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result, null, 2)}\n`)

function parseArgs(values) {
  const parsed = { apply: false, branch: '', decidedAt: '', evidenceSnapshot: '', json: false, metrics: '', overrideReason: '', registry: '', week: 0 }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--branch') parsed.branch = values[++index] || ''
    else if (value === '--decided-at') parsed.decidedAt = values[++index] || ''
    else if (value === '--evidence-snapshot') parsed.evidenceSnapshot = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--metrics') parsed.metrics = values[++index] || ''
    else if (value === '--override-reason') parsed.overrideReason = values[++index] || ''
    else if (value === '--registry') parsed.registry = values[++index] || ''
    else if (value === '--week') parsed.week = Number(values[++index] || 0)
    else throw new Error(`未知参数：${value}`)
  }
  if (!Number.isInteger(parsed.week) || parsed.week < 1) throw new Error('--week 必须是正整数。')
  if (!parsed.branch) throw new Error('缺少 --branch。')
  if (!parsed.decidedAt) throw new Error('缺少 --decided-at。')
  if (!parsed.evidenceSnapshot) throw new Error('缺少 --evidence-snapshot。')
  return parsed
}

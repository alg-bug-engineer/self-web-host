import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const registry = JSON.parse(await fs.readFile(path.resolve(
  projectDir,
  args.registry || 'ops/campaigns/ai-native-generation-30d-owner-decisions.json',
), 'utf8'))
validateRegistry(registry)
const asOf = normalizeAsOf(args.asOf)
const asOfMs = Date.parse(asOf)
const decisions = registry.decisions.map((decision) => evaluateDecision(decision, asOfMs))
const surfaced = decisions.filter((decision) => ['action_due', 'overdue'].includes(decision.state))
const report = {
  campaignId: registry.campaignId,
  asOf,
  counts: {
    total: decisions.length,
    waiting: decisions.filter((decision) => decision.state === 'waiting_to_ask').length,
    actionDue: decisions.filter((decision) => decision.state === 'action_due').length,
    overdue: decisions.filter((decision) => decision.state === 'overdue').length,
    resolved: decisions.filter((decision) => decision.state === 'resolved').length,
  },
  state: surfaced.length ? 'owner_action_needed' : 'no_owner_action_now',
  surfaced,
  decisions,
  policy: registry.policy,
  externalWritesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))

function parseArgs(values) {
  const parsed = { asOf: '', json: false, registry: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--registry') parsed.registry = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

function validateRegistry(value) {
  if (value.version !== 1 || value.campaignId !== 'ai-native-generation-30d') throw new Error('作者决策登记版本或 campaignId 无效。')
  if (!Array.isArray(value.decisions) || !value.decisions.length) throw new Error('作者决策登记不能为空。')
  const ids = new Set()
  for (const decision of value.decisions) {
    if (!decision.id || ids.has(decision.id)) throw new Error('作者决策 ID 缺失或重复。')
    ids.add(decision.id)
    if (!['pending', 'approved', 'declined'].includes(decision.status)) throw new Error(`${decision.id} status 无效。`)
    if (!Number.isFinite(Date.parse(decision.askNotBefore)) || !Number.isFinite(Date.parse(decision.dueAt))) throw new Error(`${decision.id} 时间无效。`)
    if (Date.parse(decision.askNotBefore) >= Date.parse(decision.dueAt)) throw new Error(`${decision.id} askNotBefore 必须早于 dueAt。`)
    if (!Array.isArray(decision.blockingActions) || !decision.blockingActions.length || !decision.decisionPrompt || !decision.safeFallback) {
      throw new Error(`${decision.id} 决策说明不完整。`)
    }
    if (!decision.evidenceAsset || !decision.evidenceAsset.startsWith('content/') && !decision.evidenceAsset.startsWith('ops/')) {
      throw new Error(`${decision.id} evidenceAsset 无效。`)
    }
  }
}

function normalizeAsOf(value) {
  if (!value) return new Date().toISOString()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00:00+08:00`
  if (!Number.isFinite(Date.parse(value))) throw new Error('--as-of 必须为 YYYY-MM-DD 或 ISO 8601 时间。')
  return value
}

function evaluateDecision(decision, asOfMs) {
  let state
  if (decision.status !== 'pending') state = 'resolved'
  else if (asOfMs < Date.parse(decision.askNotBefore)) state = 'waiting_to_ask'
  else if (asOfMs <= Date.parse(decision.dueAt)) state = 'action_due'
  else state = 'overdue'
  return { ...decision, state }
}

function renderMarkdown(value) {
  const lines = [
    '# 作者决策队列',
    '',
    `- 截止：${value.asOf}`,
    `- 状态：${value.state}`,
    `- 等待询问 / 需要决定 / 已逾期 / 已解决：${value.counts.waiting} / ${value.counts.actionDue} / ${value.counts.overdue} / ${value.counts.resolved}`,
    '- 外部写入：无',
    '',
  ]
  if (!value.surfaced.length) lines.push('当前没有到达询问窗口的作者决定。')
  else for (const item of value.surfaced) lines.push(`- ${item.label}｜${item.state}｜截止 ${item.dueAt}｜${item.decisionPrompt}｜未确认回退：${item.safeFallback}`)
  return `${lines.join('\n')}\n`
}

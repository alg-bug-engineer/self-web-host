import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const registryFile = path.resolve(
  projectDir,
  args.registry || 'ops/campaigns/ai-native-generation-30d-owner-decisions.json',
)
const registry = JSON.parse(await fs.readFile(registryFile, 'utf8'))
if (registry.version !== 1 || registry.campaignId !== 'ai-native-generation-30d') throw new Error('作者决策登记无效。')
const matches = (registry.decisions || []).filter((item) => item.id === args.id)
if (matches.length !== 1) throw new Error(`必须且只能找到一个作者决定：${args.id}`)
const decision = matches[0]
if (decision.status !== 'pending') throw new Error(`${args.id} 已经登记为 ${decision.status}，拒绝覆盖。`)
if (!['approved', 'declined'].includes(args.decision)) throw new Error('--decision 必须是 approved 或 declined。')
if (!Number.isFinite(Date.parse(args.decidedAt))) throw new Error('--decided-at 必须是 ISO 8601 时间。')
if (!args.evidence || args.evidence.length < 8 || args.evidence.length > 500) throw new Error('--evidence 必须是 8—500 字的无身份操作证据。')
if (/(?:姓名|学校|住址|精确位置|手机号|微信号|身份证|聊天原文|健康情况)[：:]/u.test(args.evidence)) {
  throw new Error('--evidence 不得包含儿童或家庭身份、联系方式、聊天或健康资料。')
}

const before = structuredClone(decision)
decision.status = args.decision
decision.resolvedAt = args.decidedAt
decision.resolution = {
  decision: args.decision,
  evidence: args.evidence,
  effect: decision.resolutionEffect,
  nextAction: args.decision === 'approved' ? decision.nextActionIfApproved : decision.safeFallback,
  externalActionExecuted: false,
}
const report = {
  campaignId: registry.campaignId,
  id: decision.id,
  apply: args.apply,
  before,
  after: decision,
  queueUpdated: args.apply,
  externalWritesPerformed: false,
  guardrail: '本登记只更新本地作者决策队列；不发布、部署、修改账号、群发公众号、启用支付或改变任何专用门禁。',
}

if (args.apply) {
  const temporary = `${registryFile}.tmp-${process.pid}`
  await fs.writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await fs.rename(temporary, registryFile)
}
process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report))

function parseArgs(values) {
  const parsed = { apply: false, decidedAt: '', decision: '', evidence: '', id: '', json: false, registry: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--decided-at') parsed.decidedAt = values[++index] || ''
    else if (value === '--decision') parsed.decision = values[++index] || ''
    else if (value === '--evidence') parsed.evidence = values[++index] || ''
    else if (value === '--id') parsed.id = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--registry') parsed.registry = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (!parsed.id) throw new Error('--id 不能为空。')
  return parsed
}

function renderMarkdown(value) {
  return `# 作者决定登记\n\n- 决定：${value.id}\n- 结果：${value.after.status}\n- 写入队列：${value.queueUpdated ? '是' : '否（dry-run）'}\n- 外部动作：无\n- 下一步：${value.after.resolution.nextAction}\n`
}

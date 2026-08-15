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
const intakeFile = path.resolve(
  projectDir,
  args.file || 'ops/campaigns/ai-native-generation-30d-guardian-intake.json',
)
const intake = JSON.parse(await fs.readFile(intakeFile, 'utf8'))
validateConfig(intake)

const previous = intake.snapshots.at(-1)
const previousActive = previous?.activeQualifiedInterests || 0
if (args.withdrawn > previousActive + args.newQualified) {
  throw new Error('--withdrawn 不能大于上一快照有效意向加本次新增。')
}
const reviewedInquiries = args.newQualified + args.incomplete + args.duplicate + args.ineligible
const activeQualifiedInterests = previousActive + args.newQualified - args.withdrawn
assertDistribution('年龄段', args.newQualified, [args.age8to10, args.age11to12, args.age13to14])
assertDistribution('共同投入', args.newQualified, [args.timeUnder30, args.time30to60, args.time60to90])
assertDistribution('参与偏好', args.newQualified, [args.prefAsync, args.prefOfficeHours, args.prefBoth])
assertDistribution('来源归因', args.newQualified, [
  args.originZsxq,
  args.originWechat,
  args.originX,
  args.originCsdn,
  args.originToutiao,
  args.originWebsite,
  args.originUnattributed,
])
if (previous && Date.parse(args.capturedAt) <= Date.parse(previous.capturedAt)) {
  throw new Error('--captured-at 必须晚于上一快照。')
}

const snapshot = {
  capturedAt: args.capturedAt,
  source: '公众号后台可见私信人工汇总',
  reviewedInquiries,
  newQualified: args.newQualified,
  incomplete: args.incomplete,
  duplicate: args.duplicate,
  ineligibleOrDeclined: args.ineligible,
  withdrawn: args.withdrawn,
  activeQualifiedInterests,
  ageBands: {
    '8-10': args.age8to10,
    '11-12': args.age11to12,
    '13-14': args.age13to14,
  },
  weeklyTime: {
    under30: args.timeUnder30,
    '30-60': args.time30to60,
    '60-90': args.time60to90,
  },
  participationPreference: {
    async: args.prefAsync,
    officeHours: args.prefOfficeHours,
    both: args.prefBoth,
  },
  attributionOrigin: {
    zsxq: args.originZsxq,
    wechat: args.originWechat,
    x: args.originX,
    csdn: args.originCsdn,
    toutiao: args.originToutiao,
    website: args.originWebsite,
    unattributed: args.originUnattributed,
  },
  containsIdentifiersOrMessageText: false,
}

const result = {
  campaignId: intake.campaignId,
  mode: args.apply ? 'apply' : 'dry_run',
  snapshot,
  previousActiveQualifiedInterests: previousActive,
  writesPerformed: false,
}
if (args.apply) {
  intake.snapshots.push(snapshot)
  intake.status = 'collecting'
  await fs.writeFile(intakeFile, `${JSON.stringify(intake, null, 2)}\n`, 'utf8')
  result.writesPerformed = true
}

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  process.stdout.write([
    '# 监护人意向聚合登记',
    '',
    `- 模式：${result.mode}`,
    `- 本次核验：${reviewedInquiries}`,
    `- 新增有效 / 缺字段 / 重复 / 不适配或放弃：${args.newQualified} / ${args.incomplete} / ${args.duplicate} / ${args.ineligible}`,
    `- 撤回：${args.withdrawn}`,
    `- 本次新增来源（星球 / 公众号 / X / CSDN / 头条 / 网站 / 未归因）：${args.originZsxq} / ${args.originWechat} / ${args.originX} / ${args.originCsdn} / ${args.originToutiao} / ${args.originWebsite} / ${args.originUnattributed}`,
    `- 当前有效意向：${activeQualifiedInterests}`,
    `- 已写入：${result.writesPerformed ? '是' : '否'}`,
    '',
    '> 只登记聚合数字，不填写昵称、账号、消息原文、联系方式或儿童资料。',
    '',
  ].join('\n'))
}

function parseArgs(values) {
  const parsed = {
    age8to10: 0,
    age11to12: 0,
    age13to14: 0,
    apply: false,
    capturedAt: '',
    duplicate: 0,
    file: '',
    incomplete: 0,
    ineligible: 0,
    json: false,
    newQualified: 0,
    originCsdn: 0,
    originToutiao: 0,
    originUnattributed: 0,
    originWechat: 0,
    originWebsite: 0,
    originX: 0,
    originZsxq: 0,
    prefAsync: 0,
    prefBoth: 0,
    prefOfficeHours: 0,
    time30to60: 0,
    time60to90: 0,
    timeUnder30: 0,
    withdrawn: 0,
  }
  const numberFlags = {
    '--new-qualified': 'newQualified',
    '--incomplete': 'incomplete',
    '--duplicate': 'duplicate',
    '--ineligible': 'ineligible',
    '--withdrawn': 'withdrawn',
    '--age-8-10': 'age8to10',
    '--age-11-12': 'age11to12',
    '--age-13-14': 'age13to14',
    '--time-under-30': 'timeUnder30',
    '--time-30-60': 'time30to60',
    '--time-60-90': 'time60to90',
    '--pref-async': 'prefAsync',
    '--pref-office-hours': 'prefOfficeHours',
    '--pref-both': 'prefBoth',
    '--origin-zsxq': 'originZsxq',
    '--origin-wechat': 'originWechat',
    '--origin-x': 'originX',
    '--origin-csdn': 'originCsdn',
    '--origin-toutiao': 'originToutiao',
    '--origin-website': 'originWebsite',
    '--origin-unattributed': 'originUnattributed',
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--captured-at') parsed.capturedAt = values[++index] || ''
    else if (value === '--file') parsed.file = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (numberFlags[value]) parsed[numberFlags[value]] = parseCount(values[++index], value)
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

function parseCount(value, flag) {
  const count = Number(value)
  if (!Number.isInteger(count) || count < 0) throw new Error(`${flag} 必须是非负整数。`)
  return count
}

function validateArgs(value) {
  if (!value.capturedAt || Number.isNaN(Date.parse(value.capturedAt))) {
    throw new Error('--captured-at 必须是有效时间。')
  }
}

function validateConfig(value) {
  if (value.version !== 1 || value.campaignId !== 'ai-native-generation-30d') {
    throw new Error('监护人意向台账配置无效。')
  }
  if (value.storageMode !== 'aggregate_only') throw new Error('台账必须使用 aggregate_only。')
  if (!Array.isArray(value.snapshots)) throw new Error('台账 snapshots 必须为数组。')
  if (!value.referralCodes || Object.keys(value.referralCodes).length < 7) throw new Error('台账 referralCodes 不完整。')
}

function assertDistribution(label, expected, values) {
  const actual = values.reduce((sum, value) => sum + value, 0)
  if (actual !== expected) throw new Error(`${label}分布合计 ${actual} 必须等于 --new-qualified ${expected}。`)
}

function renderHelp() {
  return `监护人课程内测意向聚合登记\n\n必填：\n  --captured-at ISO\n\n计数字段：\n  --new-qualified --incomplete --duplicate --ineligible --withdrawn\n  --age-8-10 --age-11-12 --age-13-14\n  --time-under-30 --time-30-60 --time-60-90\n  --pref-async --pref-office-hours --pref-both\n  --origin-zsxq --origin-wechat --origin-x --origin-csdn --origin-toutiao --origin-website --origin-unattributed\n\n默认 dry-run；显式 --apply 才写入。年龄、投入、参与偏好和来源归因四组分布各自必须等于新增有效意向；无法确认来源时只计 --origin-unattributed，不得猜测。不得传入昵称、账号、消息原文或儿童资料。\n`
}

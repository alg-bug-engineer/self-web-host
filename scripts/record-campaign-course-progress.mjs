import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { resolveCourseProgress } from './lib/course-progress.mjs'
import { resolveGuardianIntake } from './lib/guardian-intake.mjs'

const projectDir = process.cwd()
const cliArgs = process.argv.slice(2)
if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  process.stdout.write(renderHelp())
  process.exit(0)
}
const args = parseArgs(cliArgs)
validateArgs(args)
const file = path.resolve(projectDir, args.file || 'ops/campaigns/ai-native-generation-30d-course-progress.json')
const guardianIntakeFile = path.resolve(
  projectDir,
  args.guardianIntake || 'ops/campaigns/ai-native-generation-30d-guardian-intake.json',
)
const [store, guardianIntakeConfig] = await Promise.all([
  fs.readFile(file, 'utf8').then(JSON.parse),
  fs.readFile(guardianIntakeFile, 'utf8').then(JSON.parse),
])
validateStore(store)
const guardianIntake = resolveGuardianIntake(0, guardianIntakeConfig)
const totalQualifiedEver = Object.values(guardianIntake.acquisitionOriginTotals)
  .reduce((sum, value) => sum + value, 0)
const previous = resolveCourseProgress(0, 0, store)
if (previous.capturedAt && Date.parse(args.capturedAt) <= Date.parse(previous.capturedAt)) {
  throw new Error('--captured-at 必须晚于上一快照。')
}

const snapshot = {
  capturedAt: args.capturedAt,
  source: '公众号私信与知识星球课程任务的可见页面人工聚合',
  newInvited: args.newInvited,
  newExplicitOptIns: args.newOptIns,
  newCourseStarted: args.newStarted,
  newCourseCompleted: args.newCompleted,
  newWithdrawnBeforeStart: args.withdrawnBeforeStart,
  newWithdrawnAfterStart: args.withdrawnAfterStart,
  totalInvited: previous.totalInvited + args.newInvited,
  explicitOptIns: previous.explicitOptIns + args.newOptIns,
  courseStartedFamilies: previous.courseStartedFamilies + args.newStarted,
  courseCompletedFamilies: previous.courseCompletedFamilies + args.newCompleted,
  withdrawnBeforeStart: previous.withdrawnBeforeStart + args.withdrawnBeforeStart,
  withdrawnAfterStart: previous.withdrawnAfterStart + args.withdrawnAfterStart,
  activeCourseFamilies: previous.activeCourseFamilies
    + args.newStarted - args.newCompleted - args.withdrawnAfterStart,
  containsIdentifiersOrMessageText: false,
}
const nextStore = structuredClone(store)
nextStore.snapshots.push(snapshot)
nextStore.status = 'collecting'
resolveCourseProgress(0, 0, nextStore)
if (snapshot.totalInvited > totalQualifiedEver) {
  throw new Error(`累计邀请 ${snapshot.totalInvited} 不能大于意向台账累计有效意向 ${totalQualifiedEver}。`)
}

const result = {
  campaignId: store.campaignId,
  mode: args.apply ? 'apply' : 'dry_run',
  snapshot,
  qualifiedGuardianInterestsEver: totalQualifiedEver,
  writesPerformed: false,
}
if (args.apply) {
  await fs.writeFile(file, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8')
  result.writesPerformed = true
}

if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else process.stdout.write(renderMarkdown(result))

function parseArgs(values) {
  const parsed = {
    apply: false,
    capturedAt: '',
    file: '',
    guardianIntake: '',
    json: false,
    newCompleted: 0,
    newInvited: 0,
    newOptIns: 0,
    newStarted: 0,
    withdrawnAfterStart: 0,
    withdrawnBeforeStart: 0,
  }
  const countFlags = {
    '--new-invited': 'newInvited',
    '--new-opt-ins': 'newOptIns',
    '--new-started': 'newStarted',
    '--new-completed': 'newCompleted',
    '--withdrawn-before-start': 'withdrawnBeforeStart',
    '--withdrawn-after-start': 'withdrawnAfterStart',
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--captured-at') parsed.capturedAt = values[++index] || ''
    else if (value === '--file') parsed.file = values[++index] || ''
    else if (value === '--guardian-intake') parsed.guardianIntake = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (countFlags[value]) parsed[countFlags[value]] = parseCount(values[++index], value)
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

function validateStore(value) {
  if (value.version !== 1 || value.campaignId !== 'ai-native-generation-30d') {
    throw new Error('课程进度台账配置无效。')
  }
  if (value.storageMode !== 'aggregate_only' || value.mode !== 'free_research_trial') {
    throw new Error('课程进度台账必须使用 aggregate_only/free_research_trial。')
  }
  if (!Array.isArray(value.snapshots)) throw new Error('课程进度台账 snapshots 必须为数组。')
}

function renderMarkdown(result) {
  const value = result.snapshot
  return [
    '# 免费研究型试学进度聚合登记',
    '',
    `- 模式：${result.mode}`,
    `- 新增邀请 / 明确参与 / 开始 / 完成：${value.newInvited} / ${value.newExplicitOptIns} / ${value.newCourseStarted} / ${value.newCourseCompleted}`,
    `- 新增开始前退出 / 开始后退出：${value.newWithdrawnBeforeStart} / ${value.newWithdrawnAfterStart}`,
    `- 累计明确参与 / 开始 / 完成 / 当前进行中：${value.explicitOptIns} / ${value.courseStartedFamilies} / ${value.courseCompletedFamilies} / ${value.activeCourseFamilies}`,
    `- 已写入：${result.writesPerformed ? '是' : '否'}`,
    '',
    '> 只登记人工核验后的聚合数字；不传入昵称、账号、私信或评论原文、联系方式、哈希标识或儿童资料。公开视频播放、阅读、点赞、旧作业和星主示范不计课程开始。',
    '',
  ].join('\n')
}

function renderHelp() {
  return `免费研究型试学进度聚合登记\n\n必填：\n  --captured-at ISO\n\n计数字段：\n  --new-invited --new-opt-ins --new-started --new-completed\n  --withdrawn-before-start --withdrawn-after-start\n\n可选文件：\n  --file <课程进度台账> --guardian-intake <监护人意向台账>\n\n默认 dry-run；显式 --apply 才写入。累计邀请不得超过意向台账累计有效意向；明确参与不得超过邀请；开始不得超过明确参与且未在开始前退出；完成与开始后退出合计不得超过开始。只登记聚合数字，不得传入身份、消息原文或儿童资料。公开视频播放、阅读、点赞、旧作业或星主示范不计课程开始。\n`
}

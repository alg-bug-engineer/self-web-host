import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
validateArgs(args)
const logFile = path.resolve(projectDir, args.log || 'ops/campaigns/ai-native-generation-30d-log.json')
const calendarFile = args.calendar
  ? path.resolve(projectDir, args.calendar)
  : await findCalendarByEntry(args.calendarEntry)
const [log, calendar] = await Promise.all([readJson(logFile), readJson(calendarFile)])
const calendarEntry = calendar.entries.find((entry) => entry.id === args.calendarEntry)
if (!calendarEntry) throw new Error(`周历中不存在 ${args.calendarEntry}。`)
if (calendarEntry.platform !== args.platform) throw new Error('周历条目平台与 --platform 不一致。')
if (calendarEntry.date > args.attemptedAt.slice(0, 10)) throw new Error('尝试时间不能早于周历日期。')
if (args.terminal && !new Set(['scheduled_not_public', 'platform_rejected']).has(args.outcome)) {
  throw new Error('--terminal 只适用于 scheduled_not_public 或 platform_rejected。')
}
if (args.retryNotBefore && Date.parse(args.retryNotBefore) <= Date.parse(args.attemptedAt)) {
  throw new Error('--retry-not-before 必须晚于 --attempted-at。')
}

const attempt = {
  platform: args.platform,
  calendarEntryId: calendarEntry.id,
  title: calendarEntry.title,
  action: args.action,
  attemptedAt: args.attemptedAt,
  outcome: args.outcome,
  terminal: args.terminal,
  evidence: args.evidence,
  safeNextAction: args.safeNextAction,
  ...(args.retryNotBefore ? { retryNotBefore: args.retryNotBefore } : {}),
  ...(args.externalId ? { externalId: args.externalId } : {}),
  externalPublicationVerified: false,
}
const allAttempts = (log.dailyRuns || []).flatMap((run) => run.externalPublishAttempts || [])
if (allAttempts.some((item) =>
  item.platform === attempt.platform
  && item.calendarEntryId === attempt.calendarEntryId
  && item.action === attempt.action
  && item.attemptedAt === attempt.attemptedAt
  && item.outcome === attempt.outcome
)) throw new Error('相同平台、周历条目、动作、时间和结果的失败尝试已存在。')

const dateKey = args.attemptedAt.slice(0, 10)
let dailyRun = (log.dailyRuns || []).find((run) => run.date === dateKey)
if (!dailyRun) {
  dailyRun = {
    date: dateKey,
    phase: 'execution',
    status: 'in_progress',
    outputs: [],
    externalPublishes: [],
    externalPublishAttempts: [],
    scheduledPublishes: [],
    metricSnapshots: [],
    blockers: [],
    notes: [],
  }
  log.dailyRuns ||= []
  log.dailyRuns.push(dailyRun)
}
dailyRun.externalPublishAttempts ||= []
dailyRun.externalPublishAttempts.push(attempt)
dailyRun.blockers ||= []
dailyRun.blockers.push(`${args.platform}/${calendarEntry.id} ${args.outcome}：${args.safeNextAction}`)
dailyRun.notes ||= []
dailyRun.notes.push(`${args.platform} 未取得公开发布证据；已登记 ${args.outcome}${args.terminal ? ' 终局失败' : ' 待复核尝试'}，周历状态未改变。`)
log.updatedAt = args.recordedAt || new Date().toISOString()

const result = {
  campaignId: log.campaignId,
  mode: args.apply ? 'apply' : 'dry_run',
  attempt,
  calendar: path.relative(projectDir, calendarFile),
  calendarStatusUnchanged: calendarEntry.status,
  writesPerformed: false,
}
if (args.apply) {
  await fs.writeFile(logFile, `${JSON.stringify(log, null, 2)}\n`, 'utf8')
  result.writesPerformed = true
}
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result))

function parseArgs(values) {
  const parsed = {
    action: '',
    apply: false,
    attemptedAt: '',
    calendar: '',
    calendarEntry: '',
    evidence: '',
    externalId: '',
    json: false,
    log: '',
    outcome: '',
    recordedAt: '',
    retryNotBefore: '',
    safeNextAction: '',
    platform: '',
    terminal: false,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--action') parsed.action = values[++index] || ''
    else if (value === '--apply') parsed.apply = true
    else if (value === '--attempted-at') parsed.attemptedAt = values[++index] || ''
    else if (value === '--calendar') parsed.calendar = values[++index] || ''
    else if (value === '--calendar-entry') parsed.calendarEntry = values[++index] || ''
    else if (value === '--evidence') parsed.evidence = values[++index] || ''
    else if (value === '--external-id') parsed.externalId = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--outcome') parsed.outcome = values[++index] || ''
    else if (value === '--recorded-at') parsed.recordedAt = values[++index] || ''
    else if (value === '--retry-not-before') parsed.retryNotBefore = values[++index] || ''
    else if (value === '--safe-next-action') parsed.safeNextAction = values[++index] || ''
    else if (value === '--platform') parsed.platform = values[++index] || ''
    else if (value === '--terminal') parsed.terminal = true
    else throw new Error(`未知参数：${value}`)
  }
  return parsed
}

function validateArgs(value) {
  const allowedPlatforms = new Set(['website', 'wechat', 'csdn', 'x', 'toutiao', 'zsxq'])
  const allowedActions = new Set(['publish', 'verify_scheduled', 'verify_overdue', 'media_upload', 'attachment_upload', 'public_verification'])
  const allowedOutcomes = new Set(['login_required', 'verification_required', 'risk_control', 'upload_failed', 'processing_failed', 'public_url_not_obtained', 'scheduled_not_public', 'platform_rejected', 'unknown_state'])
  if (!allowedPlatforms.has(value.platform)) throw new Error('--platform 无效。')
  if (!allowedActions.has(value.action)) throw new Error('--action 无效。')
  if (!allowedOutcomes.has(value.outcome)) throw new Error('--outcome 无效。')
  if (!value.calendarEntry) throw new Error('--calendar-entry 不能为空。')
  if (!Number.isFinite(Date.parse(value.attemptedAt))) throw new Error('--attempted-at 必须是 ISO 8601 时间。')
  if (value.recordedAt && !Number.isFinite(Date.parse(value.recordedAt))) throw new Error('--recorded-at 必须是 ISO 8601 时间。')
  if (value.retryNotBefore && !Number.isFinite(Date.parse(value.retryNotBefore))) throw new Error('--retry-not-before 必须是 ISO 8601 时间。')
  if (value.evidence.length < 12 || value.evidence.length > 500) throw new Error('--evidence 必须是 12—500 字的无身份可见证据。')
  if (value.safeNextAction.length < 8 || value.safeNextAction.length > 300) throw new Error('--safe-next-action 必须是 8—300 字。')
  for (const text of [value.evidence, value.safeNextAction]) {
    if (/(?:姓名|学校|住址|精确位置|手机号|微信号|身份证|聊天原文|健康情况)[：:]/u.test(text)) {
      throw new Error('失败记录不得包含儿童或家庭身份、联系方式、聊天或健康资料。')
    }
  }
}

async function findCalendarByEntry(entryId) {
  const directory = path.resolve(projectDir, 'ops/campaigns')
  const candidates = (await fs.readdir(directory))
    .filter((name) => /^ai-native-generation-30d-week\d+-content-calendar\.json$/.test(name))
  const matches = []
  for (const name of candidates) {
    const filename = path.join(directory, name)
    const calendar = await readJson(filename)
    if ((calendar.entries || []).some((entry) => entry.id === entryId)) matches.push(filename)
  }
  if (matches.length !== 1) throw new Error(`必须且只能找到一个包含 ${entryId} 的周历。`)
  return matches[0]
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'))
}

function renderMarkdown(value) {
  return `# 外部发布失败尝试登记\n\n- 模式：${value.mode}\n- 平台：${value.attempt.platform}\n- 周历条目：${value.attempt.calendarEntryId}\n- 结果：${value.attempt.outcome}\n- 终局失败：${value.attempt.terminal ? '是' : '否'}\n- 周历状态：${value.calendarStatusUnchanged}（未改变）\n- 已写入：${value.writesPerformed ? '是' : '否'}\n`
}

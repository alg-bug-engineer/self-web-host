import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { resolveGuardianIntake } from './lib/guardian-intake.mjs'
import { resolveCourseProgress } from './lib/course-progress.mjs'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const campaignFile = path.resolve(projectDir, args.campaign || 'ops/campaigns/ai-native-generation-30d.json')
const metricsFile = path.resolve(projectDir, args.metrics || 'ops/campaigns/ai-native-generation-30d-zsxq-metrics.json')
const logFile = path.resolve(projectDir, args.log || 'ops/campaigns/ai-native-generation-30d-log.json')
const trackingFile = path.resolve(projectDir, args.tracking || 'ops/campaigns/ai-native-generation-30d-tracking-links.json')
const paidPilotFile = path.resolve(projectDir, args.paidPilot || 'ops/campaigns/ai-native-generation-30d-paid-pilot.json')
const guardianIntakeFile = path.resolve(projectDir, args.guardianIntake || 'ops/campaigns/ai-native-generation-30d-guardian-intake.json')
const courseProgressFile = path.resolve(projectDir, args.courseProgress || 'ops/campaigns/ai-native-generation-30d-course-progress.json')

const [campaign, metrics, log, tracking, paidPilot, guardianIntakeConfig, courseProgressConfig] = await Promise.all([
  readJson(campaignFile),
  readJson(metricsFile),
  readJson(logFile),
  readJson(trackingFile),
  readJson(paidPilotFile),
  readJson(guardianIntakeFile),
  readJson(courseProgressFile),
])

const latestRaw = metrics.snapshots.at(-1)
if (!latestRaw) throw new Error('缺少活动指标快照。')
const guardianIntake = resolveGuardianIntake(latestRaw.qualifiedGuardianInterests, guardianIntakeConfig)
const courseProgress = resolveCourseProgress(
  latestRaw.courseStartedFamilies,
  latestRaw.courseCompletedFamilies,
  courseProgressConfig,
)
const latest = {
  ...latestRaw,
  qualifiedGuardianInterests: guardianIntake.activeQualifiedInterests,
  courseStartedFamilies: courseProgress.courseStartedFamilies,
  courseCompletedFamilies: courseProgress.courseCompletedFamilies,
}
const asOf = args.asOf || shanghaiDateKey()
const phase = asOf < campaign.startsOn ? 'setup' : asOf > campaign.endsOn ? 'review' : 'active'
const targets = campaign.successMetrics
const guardianSurvey = log.baselines?.guardianSurvey || {}
const values = {
  validParentSurveys: guardianSurvey.qualifiedSubmissions ?? 0,
  challengeFamilies: latest.challengeCompletedFamilies,
  qualifiedPaidPageVisitors: latest.campaignPaidPageVisitors,
  planetJoinClickers: latest.campaignJoinClickers,
  newPlanetPaidFamilies: latest.newPaidFamilies,
  qualifiedGuardianInterests: latest.qualifiedGuardianInterests,
  paidPilotFamilies: latest.paidPilotFamilies,
  paidPageJoinClickRate: safeRate(latest.campaignJoinClickers, latest.campaignPaidPageVisitors),
  joinClickPaymentRate: safeRate(latest.newPaidFamilies, latest.campaignJoinClickers),
  firstWeekAssignmentRate: safeRate(latest.validWeek1Families, latest.startedWeek1Families),
  courseCompletionRate: safeRate(latest.courseCompletedFamilies, latest.courseStartedFamilies),
  authorizedFeedbackCount: latest.authorizedFeedbackCount,
  planetWeeklyActiveRate: safeRate(latest.sevenDayActiveMembers, latest.unexpiredMembers),
}

const definitions = [
  metric('validParentSurveys', '需求', '有效监护人匿名调研', '2026-08-12', '网站匿名调研去重有效样本',
    guardianSurvey.status === 'local_not_public' ? '课程页尚未公开，调研仍为本地状态' : ''),
  metric('challengeFamilies', '激活', '完成三天挑战家庭', '2026-08-20', '知识星球去重完成家庭'),
  metric('qualifiedPaidPageVisitors', '星球付费', '活动归因付费页访问', '2026-08-12', '活动链接或人工核对的去重访问',
    tracking.status !== 'active' ? `渠道链接仍为 ${tracking.status}` : ''),
  metric('planetJoinClickers', '星球付费', '活动归因点击加入', '2026-08-12', '活动归因的去重点击',
    tracking.status !== 'active' ? `渠道链接仍为 ${tracking.status}` : ''),
  metric('newPlanetPaidFamilies', '星球付费', '新增星球付费家庭', '2026-08-12', '活动期间知识星球新增付费交易'),
  metric('qualifiedGuardianInterests', '课程内测', '有效监护人内测意向', '2026-08-12', '匿名事件与公众号最小字段人工去重'),
  metric('paidPilotFamilies', '课程内测', '课程内测付费家庭', '2026-08-31', '完成付款的课程内测家庭',
    paidPilot.paymentEnabled ? '' : `付款门禁未开启（${paidPilot.status}）`),
  metric('paidPageJoinClickRate', '星球付费', '付费页访问到点击率', '2026-08-12', '活动归因点击 ÷ 活动归因访问',
    tracking.status !== 'active' ? `渠道链接仍为 ${tracking.status}` : ''),
  metric('joinClickPaymentRate', '星球付费', '点击到星球支付率', '2026-08-12', '新增星球付费家庭 ÷ 活动归因点击'),
  metric('firstWeekAssignmentRate', '激活', '第一周任务完成率', '2026-08-13', '去重有效家庭 ÷ 明确开始家庭'),
  metric('courseCompletionRate', '课程内测', '课程完成率', '2026-09-07', '完成 L12 家庭 ÷ 明确开始课程家庭'),
  metric('authorizedFeedbackCount', '证据', '获授权反馈数', '2026-09-07', '监护人另行明确授权的去标识化反馈'),
  metric('planetWeeklyActiveRate', '激活', '知识星球 7 日活跃率', '2026-08-13', '7 日活跃成员 ÷ 有效期内成员'),
]

const scorecard = definitions.map((definition) => {
  const current = values[definition.id]
  const target = targets[definition.id]
  if (typeof target !== 'number') throw new Error(`successMetrics 缺少 ${definition.id}。`)
  const state = definition.gate
    ? 'gated'
    : asOf < definition.measurementStartsOn
      ? 'scheduled'
      : current == null
        ? 'insufficient_denominator'
        : current >= target
          ? 'target_met'
          : 'tracking'
  return {
    ...definition,
    current,
    target,
    progress: current == null ? null : round(current / target),
    state,
  }
})

const report = {
  campaignId: campaign.id,
  asOf,
  phase,
  latestSnapshot: latest.capturedAt,
  trackingStatus: tracking.status,
  paidPilotStatus: paidPilot.status,
  guardianIntake,
  courseProgress,
  activationFunnel: {
    startedWeek1Families: latest.startedWeek1Families,
    validWeek1Families: latest.validWeek1Families,
    challengeStartedFamilies: latest.challengeStartedFamilies,
    challengeCompletedFamilies: latest.challengeCompletedFamilies,
  },
  courseIntakeFunnel: {
    zsxqInquiries: latest.zsxqCourseInquiryFamilies,
    zsxqRedirected: latest.zsxqCourseRedirectedFamilies,
    zsxqRedirectRate: safeRate(latest.zsxqCourseRedirectedFamilies, latest.zsxqCourseInquiryFamilies),
    qualifiedGuardianInterests: latest.qualifiedGuardianInterests,
    explicitOptIns: courseProgress.explicitOptIns,
    courseStartedFamilies: courseProgress.courseStartedFamilies,
    courseCompletedFamilies: courseProgress.courseCompletedFamilies,
  },
  scorecard,
  cautions: [
    '近 30 日滚动访问、点击和支付不进入活动目标计分；只使用可归因的活动期字段。',
    '知识星球新增付费家庭与课程内测付费家庭是两个产品漏斗，不相加。',
    '有效监护人意向优先读取只含聚合数字的意向台账；台账尚无快照时才回退到活动指标文件。',
    '课程开始与完成优先读取免费研究型试学聚合台账；公开视频播放、阅读、点赞、旧作业或星主示范不补课程分母。',
    '没有可靠开始人数时，完成率保持不可计算；不以阅读人数补分母。',
    '目标用于月末决策，不是对外承诺，也不在测量开始前判定失败。',
  ],
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))

function metric(id, track, label, measurementStartsOn, evidence, gate = '') {
  return { id, track, label, measurementStartsOn, evidence, gate }
}

function parseArgs(values) {
  const parsed = { asOf: '', campaign: '', courseProgress: '', guardianIntake: '', json: false, log: '', metrics: '', paidPilot: '', tracking: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--campaign') parsed.campaign = values[++index] || ''
    else if (value === '--course-progress') parsed.courseProgress = values[++index] || ''
    else if (value === '--guardian-intake') parsed.guardianIntake = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--metrics') parsed.metrics = values[++index] || ''
    else if (value === '--paid-pilot') parsed.paidPilot = values[++index] || ''
    else if (value === '--tracking') parsed.tracking = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.asOf)) throw new Error('--as-of 必须是 YYYY-MM-DD。')
  return parsed
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'))
}

function safeRate(numerator, denominator) {
  if (denominator === 0) return null
  return round(numerator / denominator)
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000
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

function renderMarkdown(report) {
  const lines = [
    '# AI 原生一代 30 天核心计分板',
    '',
    `- 截止：${report.asOf}`,
    `- 阶段：${report.phase}`,
    `- 最新指标快照：${report.latestSnapshot}`,
    `- 监护人意向聚合快照：${report.guardianIntake.capturedAt || '尚未开始'}（${report.guardianIntake.activeQualifiedInterests}）`,
    `- 免费试学进度快照：${report.courseProgress.capturedAt || '尚未开始'}（明确参与 ${report.courseProgress.explicitOptIns} / 开始 ${report.courseProgress.courseStartedFamilies} / 完成 ${report.courseProgress.courseCompletedFamilies}）`,
    `- 累计新增有效意向来源（不扣撤回）：${formatOriginTotals(report.guardianIntake.acquisitionOriginTotals)}`,
    `- 渠道归因：${report.trackingStatus}`,
    `- 课程内测付款：${report.paidPilotStatus}`,
    '',
    '## 激活漏斗原始计数',
    '',
    `- 第一周开始 / 有效完成：${report.activationFunnel.startedWeek1Families} / ${report.activationFunnel.validWeek1Families}`,
    `- 三天挑战开始 / 完成：${report.activationFunnel.challengeStartedFamilies} / ${report.activationFunnel.challengeCompletedFamilies}`,
    '',
    '| 漏斗 | 指标 | 当前 / 目标 | 状态 | 证据口径 |',
    '|---|---|---:|---|---|',
    ...report.scorecard.map((item) =>
      `| ${item.track} | ${item.label} | ${formatValue(item.current)} / ${formatValue(item.target)} | ${item.state}${item.gate ? `：${item.gate}` : ''} | ${item.evidence} |`,
    ),
    '',
    '## 口径提醒',
    '',
    ...report.cautions.map((item) => `- ${item}`),
    '',
  ]
  return `${lines.join('\n')}\n`
}

function formatOriginTotals(value = {}) {
  return `知识星球 ${value.zsxq || 0} / 公众号 ${value.wechat || 0} / X ${value.x || 0} / CSDN ${value.csdn || 0} / 头条 ${value.toutiao || 0} / 网站 ${value.website || 0} / 未归因 ${value.unattributed || 0}`
}

function formatValue(value) {
  if (value == null) return '不可计算'
  if (value > 0 && value < 1) return `${(value * 100).toFixed(2)}%`
  return String(value)
}

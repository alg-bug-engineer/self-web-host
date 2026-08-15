import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { resolveGuardianIntake } from './lib/guardian-intake.mjs'
import { resolveCourseProgress } from './lib/course-progress.mjs'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const files = {
  campaign: resolve(args.campaign || 'ops/campaigns/ai-native-generation-30d.json'),
  metrics: resolve(args.metrics || 'ops/campaigns/ai-native-generation-30d-zsxq-metrics.json'),
  log: resolve(args.log || 'ops/campaigns/ai-native-generation-30d-log.json'),
  tracking: resolve(args.tracking || 'ops/campaigns/ai-native-generation-30d-tracking-links.json'),
  paidPilot: resolve(args.paidPilot || 'ops/campaigns/ai-native-generation-30d-paid-pilot.json'),
  guardianIntake: resolve(args.guardianIntake || 'ops/campaigns/ai-native-generation-30d-guardian-intake.json'),
  courseProgress: resolve(args.courseProgress || 'ops/campaigns/ai-native-generation-30d-course-progress.json'),
}
const calendarFiles = args.calendars.length
  ? args.calendars.map(resolve)
  : await discoverCalendars()

const [campaign, metrics, log, tracking, paidPilot, guardianIntakeConfig, courseProgressConfig, calendars] = await Promise.all([
  readJson(files.campaign),
  readJson(files.metrics),
  readJson(files.log),
  readJson(files.tracking),
  readJson(files.paidPilot),
  readJson(files.guardianIntake),
  readJson(files.courseProgress),
  Promise.all(calendarFiles.map(readJson)),
])

const asOf = args.asOf || shanghaiDateKey()
const latestRaw = metrics.snapshots.at(-1)
if (!latestRaw) throw new Error('缺少知识星球指标快照。')
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
const scorecard = runScorecard(asOf, files)
const contentSupply = aggregateCalendars(calendars)
const execution = aggregateExecution(log, asOf)
const phase = asOf < campaign.startsOn ? 'setup' : asOf <= campaign.endsOn ? 'active' : 'post_campaign'
const finalizationState = determineFinalization({ asOf, campaign, latest, execution })
const gates = buildGates({ tracking, paidPilot, contentSupply, log })
const decision = chooseDecision({ asOf, campaign, latest, scorecard, gates, finalizationState })

const report = {
  campaignId: campaign.id,
  asOf,
  phase,
  window: { startsOn: campaign.startsOn, endsOn: campaign.endsOn },
  latestMetricSnapshot: latest.capturedAt,
  guardianIntake,
  courseProgress,
  finalizationState,
  decision,
  contentSupply,
  execution,
  funnel: {
    firstWeek: { started: latest.startedWeek1Families, completed: latest.validWeek1Families },
    challenge: {
      started: latest.challengeStartedFamilies,
      day2: latest.challengeDay2Families,
      completed: latest.challengeCompletedFamilies,
    },
    research: {
      started: latest.researchProjectStartedFamilies,
      logged: latest.researchLogFamilies,
      completed: latest.researchProjectCompletedFamilies,
    },
    safetyAndDefense: {
      safetyCheckpoint: latest.safetyCheckpointFamilies,
      familyAgreement: latest.familyAgreementFamilies,
      defenseCompleted: latest.defenseCompletedFamilies,
    },
    planet: {
      attributablePaidPageVisitors: latest.campaignPaidPageVisitors,
      joinClickers: latest.campaignJoinClickers,
      newPaidFamilies: latest.newPaidFamilies,
    },
    courseBeta: {
      zsxqInquiries: latest.zsxqCourseInquiryFamilies,
      zsxqRedirected: latest.zsxqCourseRedirectedFamilies,
      guardianInterests: latest.qualifiedGuardianInterests,
      paidFamilies: latest.paidPilotFamilies,
      started: latest.courseStartedFamilies,
      completed: latest.courseCompletedFamilies,
    },
    authorizedFeedbackCount: latest.authorizedFeedbackCount,
  },
  scorecard: scorecard.scorecard,
  gates,
  cautions: [
    '内容供给就绪不等于已发布；只有核验真实 URL 的内容计入 externalPublishes。',
    '近 30 日平台访问、点击与支付是滚动窗口，不直接归因于本活动。',
    '没有可靠开始家庭分母时，完成率保持不可计算，不用阅读量补分母。',
    '知识星球付费与课程内测付费分别统计；课程意向不等于付款。',
    '有效监护人意向来自不含账号、私信原文或儿童资料的聚合台账；台账未开始时才回退到活动指标字段。',
    '课程开始与完成来自免费研究型试学聚合台账；公开试听与普通共学参与不能替代明确参与和课后新任务证据。',
    '作业提交不等于公开案例授权；只统计监护人另行明确授权的去标识化反馈。',
  ],
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))

function parseArgs(values) {
  const parsed = {
    asOf: '',
    calendars: [],
    campaign: '',
    courseProgress: '',
    guardianIntake: '',
    json: false,
    log: '',
    metrics: '',
    paidPilot: '',
    tracking: '',
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--calendar') parsed.calendars.push(values[++index] || '')
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
  if (parsed.calendars.some((value) => !value)) throw new Error('--calendar 不能为空。')
  return parsed
}

function resolve(filename) {
  return path.resolve(projectDir, filename)
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, 'utf8'))
}

async function discoverCalendars() {
  const directory = resolve('ops/campaigns')
  return (await fs.readdir(directory))
    .filter((name) => /^ai-native-generation-30d-week\d+-content-calendar\.json$/.test(name))
    .sort((a, b) => Number(a.match(/week(\d+)/)?.[1]) - Number(b.match(/week(\d+)/)?.[1]))
    .map((name) => path.join(directory, name))
}

function runScorecard(asOf, inputFiles) {
  const script = resolve('scripts/report-campaign-scorecard.mjs')
  const output = execFileSync(process.execPath, [
    script,
    '--as-of', asOf,
    '--json',
    '--campaign', inputFiles.campaign,
    '--metrics', inputFiles.metrics,
    '--log', inputFiles.log,
    '--tracking', inputFiles.tracking,
    '--paid-pilot', inputFiles.paidPilot,
    '--guardian-intake', inputFiles.guardianIntake,
    '--course-progress', inputFiles.courseProgress,
  ], { cwd: projectDir, encoding: 'utf8' })
  return JSON.parse(output)
}

function aggregateCalendars(calendars) {
  const readyStatuses = new Set(['published', 'scheduled', 'draft_ready', 'media_ready'])
  const byPlatform = new Map()
  let entries = 0
  let ready = 0
  let blocked = 0
  for (const calendar of calendars) {
    for (const entry of calendar.entries || []) {
      entries += 1
      if (readyStatuses.has(entry.status)) ready += 1
      if (entry.status === 'blocked') blocked += 1
      const current = byPlatform.get(entry.platform) || { platform: entry.platform, planned: 0, ready: 0, blocked: 0 }
      current.planned += 1
      if (readyStatuses.has(entry.status)) current.ready += 1
      if (entry.status === 'blocked') current.blocked += 1
      byPlatform.set(entry.platform, current)
    }
  }
  return {
    calendars: calendars.length,
    entries,
    ready,
    blocked,
    byPlatform: [...byPlatform.values()].sort((a, b) => a.platform.localeCompare(b.platform)),
  }
}

function aggregateExecution(log, asOf) {
  const runs = log.dailyRuns || []
  const published = runs.flatMap((run) => run.externalPublishes || [])
  const scheduled = runs.flatMap((run) => run.scheduledPublishes || [])
  const attempts = runs.flatMap((run) => run.externalPublishAttempts || [])
  const verifiedKeys = new Set(published.flatMap((item) => [
    `${item.platform}:${item.title || ''}`,
    item.articleId ? `${item.platform}:${item.articleId}` : '',
    item.itemId ? `${item.platform}:${item.itemId}` : '',
  ]).filter(Boolean))
  const unresolvedScheduled = scheduled.filter((item) => {
    if ((item.scheduledFor || '').slice(0, 10) > asOf) return false
    const keys = [
      `${item.platform}:${item.title || ''}`,
      item.articleId ? `${item.platform}:${item.articleId}` : '',
      item.pgcId ? `${item.platform}:${item.pgcId}` : '',
    ].filter(Boolean)
    if (keys.some((key) => verifiedKeys.has(key))) return false
    return !attempts.some((attempt) => {
      if (attempt.terminal !== true || attempt.attemptedAt < item.scheduledFor) return false
      return attempt.platform === item.platform && (
        attempt.title === item.title
        || (attempt.externalId && [item.articleId, item.pgcId].filter(Boolean).includes(attempt.externalId))
      )
    })
  })
  const terminalFailures = attempts.filter((attempt) => attempt.terminal === true && attempt.attemptedAt.slice(0, 10) <= asOf)
  const byPlatform = {}
  for (const item of published) byPlatform[item.platform] = (byPlatform[item.platform] || 0) + 1
  return {
    verifiedPublishes: published.length,
    verifiedPublishesByPlatform: byPlatform,
    publishAttempts: attempts.length,
    terminalFailures: terminalFailures.map((attempt) => ({
      platform: attempt.platform,
      calendarEntryId: attempt.calendarEntryId,
      title: attempt.title,
      attemptedAt: attempt.attemptedAt,
      outcome: attempt.outcome,
      safeNextAction: attempt.safeNextAction,
    })),
    scheduledRecords: scheduled.length,
    unresolvedScheduled: unresolvedScheduled.map((item) => ({
      platform: item.platform,
      title: item.title,
      scheduledFor: item.scheduledFor,
    })),
  }
}

function determineFinalization({ asOf, campaign, latest, execution }) {
  if (asOf < campaign.endsOn) return 'not_due'
  if (latest.capturedAt.slice(0, 10) < campaign.endsOn) return 'awaiting_final_metrics'
  if (execution.unresolvedScheduled.length) return 'awaiting_publication_verification'
  return 'final_ready'
}

function buildGates({ tracking, paidPilot, contentSupply, log }) {
  const missingOfferFields = (paidPilot.requiredBeforePayment || []).filter((field) => paidPilot.offer?.[field] == null)
  return {
    trackingStatus: tracking.status,
    coursePagePublic: tracking.status === 'active',
    paidPilotStatus: paidPilot.status,
    paymentEnabled: paidPilot.paymentEnabled === true,
    missingOfferFields,
    websiteBlockedEntries: contentSupply.byPlatform.find((item) => item.platform === 'website')?.blocked || 0,
    notebooklmStatus: log.notebooklm?.status || 'unknown',
  }
}

function chooseDecision({ asOf, campaign, latest, scorecard, gates, finalizationState }) {
  if (asOf < campaign.endsOn) {
    return { state: 'review_not_due', reason: `活动截至 ${campaign.endsOn}，当前不能作月末结论。` }
  }
  if (finalizationState !== 'final_ready') {
    return { state: 'decision_pending_evidence', reason: `最终复盘仍为 ${finalizationState}。` }
  }
  const targetMet = new Set(scorecard.scorecard.filter((item) => item.state === 'target_met').map((item) => item.id))
  const scaleRequired = [
    'challengeFamilies',
    'newPlanetPaidFamilies',
    'qualifiedGuardianInterests',
    'paidPilotFamilies',
    'courseCompletionRate',
  ]
  if (scaleRequired.every((id) => targetMet.has(id))) {
    return { state: 'continue_and_scale', reason: '激活、星球付费、监护人意向、课程付费与完成率均达到目标。' }
  }
  const actionEvidence = latest.challengeCompletedFamilies
    + latest.researchProjectCompletedFamilies
    + latest.defenseCompletedFamilies
    + latest.qualifiedGuardianInterests
    + latest.newPaidFamilies
    + latest.paidPilotFamilies
  if (actionEvidence > 0) {
    return { state: 'continue_with_funnel_repair', reason: '已经出现家庭行动或产品信号，但核心目标未同时满足。' }
  }
  if (!gates.coursePagePublic || !gates.paymentEnabled) {
    return { state: 'insufficient_evidence', reason: '关键课程入口或付款门禁未开放，零转化不能直接解释为无需求。' }
  }
  return { state: 'stop_or_redesign', reason: '入口与付款均可用，但未观察到可重复的激活或产品信号。' }
}

function renderMarkdown(report) {
  const lines = [
    '# AI 原生一代 30 天试运行复盘',
    '',
    `- 截止：${report.asOf}`,
    `- 活动窗口：${report.window.startsOn} → ${report.window.endsOn}`,
    `- 最终化状态：${report.finalizationState}`,
    `- 当前决策：${report.decision.state}`,
    `- 理由：${report.decision.reason}`,
    `- 最新指标快照：${report.latestMetricSnapshot}`,
    `- 监护人意向聚合快照：${report.guardianIntake.capturedAt || '尚未开始'}（${report.guardianIntake.activeQualifiedInterests}）`,
    `- 免费试学进度快照：${report.courseProgress.capturedAt || '尚未开始'}（明确参与 ${report.courseProgress.explicitOptIns} / 开始 ${report.courseProgress.courseStartedFamilies} / 完成 ${report.courseProgress.courseCompletedFamilies}）`,
    `- 累计新增有效意向来源（不扣撤回）：${formatOriginTotals(report.guardianIntake.acquisitionOriginTotals)}`,
    '',
    '## 内容供给与真实发布',
    '',
    `- 周历：${report.contentSupply.calendars} 份 / 条目 ${report.contentSupply.entries} / 本地就绪 ${report.contentSupply.ready} / 阻断 ${report.contentSupply.blocked}`,
    `- 已核验外部发布：${report.execution.verifiedPublishes}`,
    `- 到期未核验定时稿：${report.execution.unresolvedScheduled.length}`,
    '',
    '| 平台 | 规划 | 本地就绪 | 阻断 | 已核验发布 |',
    '|---|---:|---:|---:|---:|',
    ...report.contentSupply.byPlatform.map((item) =>
      `| ${item.platform} | ${item.planned} | ${item.ready} | ${item.blocked} | ${report.execution.verifiedPublishesByPlatform[item.platform] || 0} |`,
    ),
    '',
    '## 核心漏斗',
    '',
    `- 第一周：开始 ${report.funnel.firstWeek.started} / 完成 ${report.funnel.firstWeek.completed}`,
    `- 三天挑战：开始 ${report.funnel.challenge.started} / Day 2 ${report.funnel.challenge.day2} / 完成 ${report.funnel.challenge.completed}`,
    `- 研究项目：开始 ${report.funnel.research.started} / 日志 ${report.funnel.research.logged} / 完成 ${report.funnel.research.completed}`,
    `- 安全与答辩：安全门 ${report.funnel.safetyAndDefense.safetyCheckpoint} / 公约 ${report.funnel.safetyAndDefense.familyAgreement} / 答辩 ${report.funnel.safetyAndDefense.defenseCompleted}`,
    `- 星球：归因访问 ${report.funnel.planet.attributablePaidPageVisitors} / 加入点击 ${report.funnel.planet.joinClickers} / 新付费 ${report.funnel.planet.newPaidFamilies}`,
    `- 课程内测：星球主动询问 ${report.funnel.courseBeta.zsxqInquiries} / 已引导私信 ${report.funnel.courseBeta.zsxqRedirected} / 有效意向 ${report.funnel.courseBeta.guardianInterests} / 付费 ${report.funnel.courseBeta.paidFamilies} / 开始 ${report.funnel.courseBeta.started} / 完成 ${report.funnel.courseBeta.completed}`,
    `- 获授权反馈：${report.funnel.authorizedFeedbackCount}`,
    '',
    '## 目标计分板',
    '',
    '| 漏斗 | 指标 | 当前 / 目标 | 状态 |',
    '|---|---|---:|---|',
    ...report.scorecard.map((item) => `| ${item.track} | ${item.label} | ${formatValue(item.current)} / ${formatValue(item.target)} | ${item.state} |`),
    '',
    '## 门禁',
    '',
    `- 课程页归因：${report.gates.trackingStatus}`,
    `- 课程内测付款：${report.gates.paidPilotStatus} / enabled=${report.gates.paymentEnabled}`,
    `- 未确认付款字段：${report.gates.missingOfferFields.length ? report.gates.missingOfferFields.join(', ') : '无'}`,
    `- 网站阻断条目：${report.gates.websiteBlockedEntries}`,
    `- NotebookLM：${report.gates.notebooklmStatus}`,
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

function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

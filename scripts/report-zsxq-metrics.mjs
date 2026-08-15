import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const SNAPSHOT_NUMBER_FIELDS = [
  'members',
  'unexpiredMembers',
  'sevenDayActiveMembers',
  'monthlyActiveMembers',
  'totalTopics',
  'totalComments',
  'totalLikes',
  'cumulativeRevenueCny',
  'thirtyDayPreviewVisitors',
  'thirtyDayJoinClickers',
  'thirtyDayPaidJoins',
  'campaignPaidPageVisitors',
  'campaignJoinClickers',
  'newPaidFamilies',
  'startedWeek1Families',
  'validWeek1Families',
  'challengeStartedFamilies',
  'challengeDay2Families',
  'challengeCompletedFamilies',
  'researchProjectStartedFamilies',
  'researchLogFamilies',
  'researchProjectCompletedFamilies',
  'safetyCheckpointFamilies',
  'familyAgreementFamilies',
  'defenseCompletedFamilies',
  'zsxqCourseInquiryFamilies',
  'zsxqCourseRedirectedFamilies',
  'qualifiedGuardianInterests',
  'paidPilotFamilies',
  'courseStartedFamilies',
  'courseCompletedFamilies',
  'authorizedFeedbackCount',
]
const cliArgs = process.argv.slice(2)
if (cliArgs.includes('--help') || cliArgs.includes('-h')) {
  process.stdout.write(renderHelp())
  process.exit(0)
}
const args = parseArgs(cliArgs)
const metricsFile = path.resolve(
  projectDir,
  args.file || 'ops/campaigns/ai-native-generation-30d-zsxq-metrics.json',
)

const store = JSON.parse(await fs.readFile(metricsFile, 'utf8'))
validateStore(store)
const contentPublication = args.contentCalendarEntry
  ? await resolveContentPublication(args)
  : null

if (args.append) {
  const snapshotFile = path.resolve(projectDir, args.append)
  const snapshot = JSON.parse(await fs.readFile(snapshotFile, 'utf8'))
  validateSnapshot(snapshot, '待追加快照')
  appendSnapshot(store, snapshot)
  if (!args.dryRun) await fs.writeFile(metricsFile, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
} else if (args.captureAt) {
  const snapshot = prepareCapturedSnapshot(store.snapshots.at(-1), args, contentPublication)
  validateSnapshot(snapshot, '待采集快照')
  appendSnapshot(store, snapshot)
  if (args.apply) await fs.writeFile(metricsFile, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

const report = buildReport(store, args.from, args.to)
if (args.validateOnly) {
  process.stdout.write(`validated ${store.snapshots.length} ZSXQ metric snapshot(s)\n`)
} else if (args.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  process.stdout.write(renderMarkdown(report))
}

function parseArgs(values) {
  const parsed = {
    append: '',
    apply: false,
    captureAt: '',
    contentComments: '',
    contentCalendarEntry: '',
    contentId: '',
    contentLabel: '',
    contentLikes: '',
    contentReads: '',
    contentValidAssignments: '',
    dryRun: false,
    file: '',
    from: '',
    json: false,
    log: '',
    missingChecker: '',
    missingError: '',
    missingInput: '',
    missingOutput: '',
    missingScene: '',
    sets: [],
    source: '',
    to: '',
    validateOnly: false,
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--append') parsed.append = values[++index] || ''
    else if (value === '--apply') parsed.apply = true
    else if (value === '--capture-at') parsed.captureAt = values[++index] || ''
    else if (value === '--content-comments') parsed.contentComments = values[++index] ?? ''
    else if (value === '--content-calendar-entry') parsed.contentCalendarEntry = values[++index] || ''
    else if (value === '--content-id') parsed.contentId = values[++index] || ''
    else if (value === '--content-label') parsed.contentLabel = values[++index] || ''
    else if (value === '--content-likes') parsed.contentLikes = values[++index] ?? ''
    else if (value === '--content-reads') parsed.contentReads = values[++index] ?? ''
    else if (value === '--content-valid-assignments') parsed.contentValidAssignments = values[++index] ?? ''
    else if (value === '--dry-run') parsed.dryRun = true
    else if (value === '--file') parsed.file = values[++index] || ''
    else if (value === '--from') parsed.from = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--missing-checker') parsed.missingChecker = values[++index] ?? ''
    else if (value === '--missing-error') parsed.missingError = values[++index] ?? ''
    else if (value === '--missing-input') parsed.missingInput = values[++index] ?? ''
    else if (value === '--missing-output') parsed.missingOutput = values[++index] ?? ''
    else if (value === '--missing-scene') parsed.missingScene = values[++index] ?? ''
    else if (value === '--set') parsed.sets.push(values[++index] || '')
    else if (value === '--source') parsed.source = values[++index] || ''
    else if (value === '--to') parsed.to = values[++index] || ''
    else if (value === '--validate-only') parsed.validateOnly = true
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.dryRun && !parsed.append) throw new Error('--dry-run 必须与 --append 一起使用。')
  if (parsed.append && parsed.captureAt) throw new Error('--append 与 --capture-at 不能同时使用。')
  if (parsed.apply && !parsed.captureAt) throw new Error('--apply 必须与 --capture-at 一起使用。')
  if (parsed.captureAt && Number.isNaN(Date.parse(parsed.captureAt))) throw new Error('--capture-at 不是有效时间。')
  if (parsed.captureAt && !parsed.source) throw new Error('--capture-at 需要 --source。')
  if (parsed.contentId && !parsed.captureAt) throw new Error('--content-id 必须与 --capture-at 一起使用。')
  if (parsed.contentCalendarEntry && !parsed.captureAt) throw new Error('--content-calendar-entry 必须与 --capture-at 一起使用。')
  return parsed
}

function prepareCapturedSnapshot(latest, options, publication) {
  const snapshot = structuredClone(latest)
  snapshot.capturedAt = options.captureAt
  snapshot.source = options.source
  for (const assignment of options.sets) {
    const separator = assignment.indexOf('=')
    if (separator <= 0) throw new Error(`--set 必须是 field=value：${assignment}`)
    const field = assignment.slice(0, separator)
    if (!SNAPSHOT_NUMBER_FIELDS.includes(field)) throw new Error(`--set 不支持字段 ${field}。`)
    snapshot[field] = parseNonNegativeMetric(assignment.slice(separator + 1), `--set ${field}`)
  }
  const missingFields = {
    scene: options.missingScene,
    input: options.missingInput,
    output: options.missingOutput,
    error: options.missingError,
    checker: options.missingChecker,
  }
  for (const [field, value] of Object.entries(missingFields)) {
    if (value !== '') {
      snapshot.week1MissingFieldCounts[field] = parseNonNegativeMetric(
        value,
        `--missing-${field}`,
      )
    }
  }
  const contentId = options.contentId || publication?.calendarEntryId || ''
  if (contentId) {
    const existing = snapshot.content.find((item) => item.contentId === contentId)
    if (!existing && !options.contentLabel && !publication?.title) throw new Error('新增内容需要 --content-label。')
    const contentMetrics = {
      reads: options.contentReads,
      comments: options.contentComments,
      likes: options.contentLikes,
      validAssignments: options.contentValidAssignments,
    }
    if (!existing) {
      const missing = Object.entries(contentMetrics)
        .filter(([, value]) => value === '')
        .map(([field]) => `--content-${camelToKebab(field)}`)
      if (missing.length) {
        throw new Error(`新增内容必须显式提供全部可见指标；缺少 ${missing.join('、')}。`)
      }
    }
    const item = existing || {
      contentId,
      label: options.contentLabel || publication.title,
      reads: parseNonNegativeMetric(contentMetrics.reads, '--content-reads'),
      comments: parseNonNegativeMetric(contentMetrics.comments, '--content-comments'),
      likes: parseNonNegativeMetric(contentMetrics.likes, '--content-likes'),
      validAssignments: parseNonNegativeMetric(
        contentMetrics.validAssignments,
        '--content-valid-assignments',
      ),
    }
    if (!existing) snapshot.content.push(item)
    if (options.contentLabel) item.label = options.contentLabel
    if (publication) {
      if (existing?.calendarEntryId && existing.calendarEntryId !== publication.calendarEntryId) {
        throw new Error(`${contentId} 已绑定其他 calendarEntryId。`)
      }
      item.calendarEntryId = publication.calendarEntryId
      item.publishedAt = publication.publishedAt
      item.publicUrl = publication.url
    }
    for (const [field, value] of Object.entries(contentMetrics)) {
      if (value !== '') item[field] = parseNonNegativeMetric(value, `--content-${camelToKebab(field)}`)
    }
  }
  return snapshot
}

function parseNonNegativeMetric(value, label) {
  const metric = Number(value)
  if (!Number.isFinite(metric) || metric < 0) throw new Error(`${label} 必须是非负有限数值。`)
  return metric
}

function camelToKebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function renderHelp() {
  return [
    '知识星球指标报告与安全采集工具',
    '',
    '读取报告：',
    '  node scripts/report-zsxq-metrics.mjs [--file <指标文件>] [--from <时间>] [--to <时间>] [--json]',
    '',
    '可见指标采集（默认 dry-run）：',
    '  node scripts/report-zsxq-metrics.mjs --capture-at <ISO 8601 时间> --source <可见页面说明> \\',
    '    [--set field=value]... [--content-calendar-entry <已登记周历 ID> [--log <运营日志>] \\',
    '    [--content-id <ID>] [--content-label <标签>] \\',
    '    --content-reads <数值> --content-comments <数值> --content-likes <数值> \\',
    '    --content-valid-assignments <数值>] \\',
    '    [--missing-scene <累计数> --missing-input <累计数> --missing-output <累计数> \\',
    '    --missing-error <累计数> --missing-checker <累计数>] [--apply] [--json]',
    '',
    '其他：',
    '  --append <完整快照 JSON> [--dry-run]  校验并追加完整快照',
    '  --validate-only  只校验指标文件',
    '  --help, -h  显示帮助',
    '',
    '安全规则：正式活动主题使用 --content-calendar-entry 绑定已登记的知识星球发布证据；只填写可见聚合数字。新增内容四项指标缺一项就不建档，未获得的数字不要猜测，也不要采集儿童个人信息。',
    '',
  ].join('\n')
}

function validateStore(value) {
  if (!value || typeof value !== 'object') throw new Error('知识星球指标文件无效。')
  if (value.version !== 1) throw new Error('知识星球指标文件版本必须为 1。')
  if (value.campaignId !== 'ai-native-generation-30d') throw new Error('campaignId 不匹配。')
  if (!Array.isArray(value.snapshots) || value.snapshots.length === 0) {
    throw new Error('至少需要一个知识星球指标快照。')
  }
  let previousTime = 0
  const timestamps = new Set()
  for (const [index, snapshot] of value.snapshots.entries()) {
    validateSnapshot(snapshot, `snapshots[${index}]`)
    const currentTime = Date.parse(snapshot.capturedAt)
    if (timestamps.has(snapshot.capturedAt)) throw new Error(`快照时间重复：${snapshot.capturedAt}`)
    if (currentTime <= previousTime) throw new Error('快照必须按 capturedAt 严格升序排列。')
    timestamps.add(snapshot.capturedAt)
    previousTime = currentTime
  }
}

function validateSnapshot(snapshot, label) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error(`${label} 无效。`)
  if (!snapshot.capturedAt || Number.isNaN(Date.parse(snapshot.capturedAt))) {
    throw new Error(`${label}.capturedAt 不是有效时间。`)
  }
  if (typeof snapshot.source !== 'string' || !snapshot.source.trim()) {
    throw new Error(`${label}.source 不能为空。`)
  }
  for (const field of SNAPSHOT_NUMBER_FIELDS) assertNonNegativeNumber(snapshot[field], `${label}.${field}`)
  if (snapshot.sevenDayActiveMembers > snapshot.unexpiredMembers) {
    throw new Error(`${label}.sevenDayActiveMembers 不能大于 unexpiredMembers。`)
  }
  if (snapshot.validWeek1Families > snapshot.startedWeek1Families) {
    throw new Error(`${label}.validWeek1Families 不能大于 startedWeek1Families。`)
  }
  if (!snapshot.week1MissingFieldCounts || typeof snapshot.week1MissingFieldCounts !== 'object') {
    throw new Error(`${label}.week1MissingFieldCounts 必须是对象。`)
  }
  for (const field of ['scene', 'input', 'output', 'error', 'checker']) {
    assertNonNegativeNumber(
      snapshot.week1MissingFieldCounts[field],
      `${label}.week1MissingFieldCounts.${field}`,
    )
  }
  if (snapshot.thirtyDayJoinClickers > snapshot.thirtyDayPreviewVisitors) {
    throw new Error(`${label}.thirtyDayJoinClickers 不能大于 thirtyDayPreviewVisitors。`)
  }
  if (snapshot.thirtyDayPaidJoins > snapshot.thirtyDayJoinClickers) {
    throw new Error(`${label}.thirtyDayPaidJoins 不能大于 thirtyDayJoinClickers。`)
  }
  if (snapshot.campaignJoinClickers > snapshot.campaignPaidPageVisitors) {
    throw new Error(`${label}.campaignJoinClickers 不能大于 campaignPaidPageVisitors。`)
  }
  if (snapshot.challengeDay2Families > snapshot.challengeStartedFamilies) {
    throw new Error(`${label}.challengeDay2Families 不能大于 challengeStartedFamilies。`)
  }
  if (snapshot.challengeCompletedFamilies > snapshot.challengeDay2Families) {
    throw new Error(`${label}.challengeCompletedFamilies 不能大于 challengeDay2Families。`)
  }
  if (snapshot.researchLogFamilies > snapshot.researchProjectStartedFamilies) {
    throw new Error(`${label}.researchLogFamilies 不能大于 researchProjectStartedFamilies。`)
  }
  if (snapshot.researchProjectCompletedFamilies > snapshot.researchLogFamilies) {
    throw new Error(`${label}.researchProjectCompletedFamilies 不能大于 researchLogFamilies。`)
  }
  if (snapshot.familyAgreementFamilies > snapshot.safetyCheckpointFamilies) {
    throw new Error(`${label}.familyAgreementFamilies 不能大于 safetyCheckpointFamilies。`)
  }
  if (snapshot.defenseCompletedFamilies > snapshot.familyAgreementFamilies) {
    throw new Error(`${label}.defenseCompletedFamilies 不能大于 familyAgreementFamilies。`)
  }
  if (snapshot.zsxqCourseRedirectedFamilies > snapshot.zsxqCourseInquiryFamilies) {
    throw new Error(`${label}.zsxqCourseRedirectedFamilies 不能大于 zsxqCourseInquiryFamilies。`)
  }
  if (snapshot.paidPilotFamilies > snapshot.qualifiedGuardianInterests) {
    throw new Error(`${label}.paidPilotFamilies 不能大于 qualifiedGuardianInterests。`)
  }
  if (snapshot.courseCompletedFamilies > snapshot.courseStartedFamilies) {
    throw new Error(`${label}.courseCompletedFamilies 不能大于 courseStartedFamilies。`)
  }
  if (!Array.isArray(snapshot.content)) throw new Error(`${label}.content 必须是数组。`)
  const contentIds = new Set()
  const calendarEntryIds = new Set()
  for (const [index, item] of snapshot.content.entries()) {
    const itemLabel = `${label}.content[${index}]`
    if (typeof item.contentId !== 'string' || !item.contentId.trim()) throw new Error(`${itemLabel}.contentId 不能为空。`)
    if (contentIds.has(item.contentId)) throw new Error(`${itemLabel}.contentId 重复。`)
    contentIds.add(item.contentId)
    if (typeof item.label !== 'string' || !item.label.trim()) throw new Error(`${itemLabel}.label 不能为空。`)
    const metadataFields = ['calendarEntryId', 'publishedAt', 'publicUrl'].filter((field) => item[field] != null)
    if (metadataFields.length && metadataFields.length !== 3) {
      throw new Error(`${itemLabel} 正式主题元数据必须同时包含 calendarEntryId、publishedAt、publicUrl。`)
    }
    if (metadataFields.length) {
      if (typeof item.calendarEntryId !== 'string' || !item.calendarEntryId.trim()) throw new Error(`${itemLabel}.calendarEntryId 不能为空。`)
      if (calendarEntryIds.has(item.calendarEntryId)) throw new Error(`${itemLabel}.calendarEntryId 重复。`)
      calendarEntryIds.add(item.calendarEntryId)
      if (Number.isNaN(Date.parse(item.publishedAt))) throw new Error(`${itemLabel}.publishedAt 不是有效时间。`)
      const url = new URL(item.publicUrl)
      if (url.protocol !== 'https:') throw new Error(`${itemLabel}.publicUrl 必须使用 HTTPS。`)
      if (Date.parse(item.publishedAt) > Date.parse(snapshot.capturedAt)) throw new Error(`${itemLabel}.publishedAt 不能晚于快照时间。`)
    }
    for (const field of ['reads', 'comments', 'likes', 'validAssignments']) {
      assertNonNegativeNumber(item[field], `${itemLabel}.${field}`)
    }
  }
}

function assertNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} 必须是非负有限数值。`)
  }
}

function appendSnapshot(store, snapshot) {
  const latest = store.snapshots.at(-1)
  if (Date.parse(snapshot.capturedAt) <= Date.parse(latest.capturedAt)) {
    throw new Error(`待追加快照必须晚于最新快照 ${latest.capturedAt}。`)
  }
  store.snapshots.push(snapshot)
  validateStore(store)
}

function buildReport(store, fromValue, toValue) {
  const to = selectSnapshot(store.snapshots, toValue, 'to') || store.snapshots.at(-1)
  const toIndex = store.snapshots.indexOf(to)
  const from = selectSnapshot(store.snapshots, fromValue, 'from') || store.snapshots[Math.max(0, toIndex - 1)]
  if (Date.parse(from.capturedAt) > Date.parse(to.capturedAt)) throw new Error('--from 不能晚于 --to。')

  const changeFields = [
    'members',
    'unexpiredMembers',
    'sevenDayActiveMembers',
    'monthlyActiveMembers',
    'totalTopics',
    'totalComments',
    'totalLikes',
    'cumulativeRevenueCny',
    'thirtyDayPreviewVisitors',
    'thirtyDayJoinClickers',
    'thirtyDayPaidJoins',
    'campaignPaidPageVisitors',
    'campaignJoinClickers',
    'newPaidFamilies',
    'startedWeek1Families',
    'validWeek1Families',
    'challengeStartedFamilies',
    'challengeDay2Families',
    'challengeCompletedFamilies',
    'researchProjectStartedFamilies',
    'researchLogFamilies',
    'researchProjectCompletedFamilies',
    'safetyCheckpointFamilies',
    'familyAgreementFamilies',
    'defenseCompletedFamilies',
    'zsxqCourseInquiryFamilies',
    'zsxqCourseRedirectedFamilies',
    'qualifiedGuardianInterests',
    'paidPilotFamilies',
    'courseStartedFamilies',
    'courseCompletedFamilies',
    'authorizedFeedbackCount',
  ]
  const changes = Object.fromEntries(changeFields.map((field) => [field, round(to[field] - from[field])]))
  changes.week1MissingFieldCounts = Object.fromEntries(
    ['scene', 'input', 'output', 'error', 'checker'].map((field) => [
      field,
      round(to.week1MissingFieldCounts[field] - from.week1MissingFieldCounts[field]),
    ]),
  )
  const rates = {
    sevenDayActiveRate: safeRate(to.sevenDayActiveMembers, to.unexpiredMembers),
    paidPageJoinClickRate: safeRate(to.thirtyDayJoinClickers, to.thirtyDayPreviewVisitors),
    joinClickPaymentRate: safeRate(to.thirtyDayPaidJoins, to.thirtyDayJoinClickers),
    campaignJoinClickRate: safeRate(to.campaignJoinClickers, to.campaignPaidPageVisitors),
    firstWeekAssignmentRate: safeRate(to.validWeek1Families, to.startedWeek1Families),
    challengeCompletionRate: safeRate(to.challengeCompletedFamilies, to.challengeStartedFamilies),
    defenseCompletionRate: safeRate(to.defenseCompletedFamilies, to.safetyCheckpointFamilies),
    zsxqCourseRedirectRate: safeRate(to.zsxqCourseRedirectedFamilies, to.zsxqCourseInquiryFamilies),
    guardianInterestPaymentRate: safeRate(to.paidPilotFamilies, to.qualifiedGuardianInterests),
    courseCompletionRate: safeRate(to.courseCompletedFamilies, to.courseStartedFamilies),
  }

  return {
    campaignId: store.campaignId,
    from: from.capturedAt,
    to: to.capturedAt,
    current: to,
    changes,
    rates,
    contentChanges: buildContentChanges(from.content, to.content),
    cautions: [
      '近 30 日访问、点击与支付是滚动窗口；窗口变化不等同于本周新增。',
      '活动归因访问与点击只记录可确认来源的去重家庭；不能用近 30 日滚动指标补足。',
      '没有可靠开始人数时，首周作业率为 null，只报告有效家庭绝对数。',
      '阅读人数不能跨帖子相加后充当独立家庭数。',
    ],
  }
}

function selectSnapshot(snapshots, value, flag) {
  if (!value) return null
  const exact = snapshots.find((snapshot) => snapshot.capturedAt === value)
  if (exact) return exact
  const time = Date.parse(value)
  if (Number.isNaN(time)) throw new Error(`--${flag} 必须是快照 capturedAt 或有效时间。`)
  const eligible = snapshots.filter((snapshot) => Date.parse(snapshot.capturedAt) <= time)
  if (eligible.length === 0) throw new Error(`--${flag} 之前没有可用快照。`)
  return eligible.at(-1)
}

function buildContentChanges(fromContent, toContent) {
  const previous = new Map(fromContent.map((item) => [item.contentId, item]))
  return toContent.map((item) => {
    const before = previous.get(item.contentId)
    return {
      contentId: item.contentId,
      ...(item.calendarEntryId ? { calendarEntryId: item.calendarEntryId } : {}),
      ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
      ...(item.publicUrl ? { publicUrl: item.publicUrl } : {}),
      label: item.label,
      reads: item.reads,
      readsChange: before ? item.reads - before.reads : item.reads,
      comments: item.comments,
      commentsChange: before ? item.comments - before.comments : item.comments,
      likes: item.likes,
      likesChange: before ? item.likes - before.likes : item.likes,
      validAssignments: item.validAssignments,
      validAssignmentsChange: before ? item.validAssignments - before.validAssignments : item.validAssignments,
      isNew: !before,
    }
  })
}

async function resolveContentPublication(options) {
  const logFile = path.resolve(projectDir, options.log || 'ops/campaigns/ai-native-generation-30d-log.json')
  const log = JSON.parse(await fs.readFile(logFile, 'utf8'))
  const matches = (log.dailyRuns || [])
    .flatMap((run) => run.externalPublishes || [])
    .filter((item) => item.platform === 'zsxq' && item.calendarEntryId === options.contentCalendarEntry)
  if (matches.length !== 1) {
    throw new Error(`--content-calendar-entry ${options.contentCalendarEntry} 必须对应唯一已登记的知识星球发布证据。`)
  }
  const publication = matches[0]
  if (Date.parse(publication.publishedAt) > Date.parse(options.captureAt)) {
    throw new Error('内容发布时间不能晚于指标快照时间。')
  }
  return publication
}

function safeRate(numerator, denominator) {
  if (denominator === 0) return null
  return round(numerator / denominator)
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000
}

function renderMarkdown(report) {
  const current = report.current
  const lines = [
    '# 知识星球指标快照',
    '',
    `- 区间：${report.from} → ${report.to}`,
    `- 当前有效期成员：${current.unexpiredMembers}`,
    `- 当前 7 日活跃：${current.sevenDayActiveMembers}（${formatRate(report.rates.sevenDayActiveRate)}）`,
    `- 近 30 日付费页：访问 ${current.thirtyDayPreviewVisitors} / 点击 ${current.thirtyDayJoinClickers} / 支付 ${current.thirtyDayPaidJoins}`,
    `- 访问到点击：${formatRate(report.rates.paidPageJoinClickRate)}`,
    `- 点击到支付：${formatRate(report.rates.joinClickPaymentRate)}`,
    `- 活动归因付费页：访问 ${current.campaignPaidPageVisitors} / 点击 ${current.campaignJoinClickers} / 点击率 ${formatRate(report.rates.campaignJoinClickRate)}`,
    `- 活动新增星球付费家庭：${current.newPaidFamilies}`,
    `- 第一周：开始 ${current.startedWeek1Families} / 有效完成 ${current.validWeek1Families} / 作业率 ${formatRate(report.rates.firstWeekAssignmentRate)}`,
    `- 首帖缺失格累计：场景 ${current.week1MissingFieldCounts.scene} / 输入 ${current.week1MissingFieldCounts.input} / 输出 ${current.week1MissingFieldCounts.output} / 错误 ${current.week1MissingFieldCounts.error} / 检查者 ${current.week1MissingFieldCounts.checker}`,
    `- 三天挑战：开始 ${current.challengeStartedFamilies} / Day 2 ${current.challengeDay2Families} / 完成 ${current.challengeCompletedFamilies} / 完成率 ${formatRate(report.rates.challengeCompletionRate)}`,
    `- 亲子研究项目：开始 ${current.researchProjectStartedFamilies} / 日志 ${current.researchLogFamilies} / 完成 ${current.researchProjectCompletedFamilies}`,
    `- 安全与终课：完成安全门 ${current.safetyCheckpointFamilies} / 家庭公约 ${current.familyAgreementFamilies} / 答辩 ${current.defenseCompletedFamilies} / 答辩率 ${formatRate(report.rates.defenseCompletionRate)}`,
    `- 星球课程询问：主动询问 ${current.zsxqCourseInquiryFamilies} / 已引导私信 ${current.zsxqCourseRedirectedFamilies} / 引导率 ${formatRate(report.rates.zsxqCourseRedirectRate)}`,
    `- 监护人意向：${current.qualifiedGuardianInterests} / 付费内测家庭：${current.paidPilotFamilies}`,
    `- 课程内测：开始 ${current.courseStartedFamilies} / 完成 ${current.courseCompletedFamilies} / 完成率 ${formatRate(report.rates.courseCompletionRate)}`,
    `- 获授权反馈：${current.authorizedFeedbackCount}`,
    '',
    '## 内容变化',
    '',
    '| 内容 | 阅读 | Δ阅读 | 评论 | 有效任务 |',
    '|---|---:|---:|---:|---:|',
    ...report.contentChanges.map(
      (item) => `| ${item.label} | ${item.reads} | ${formatSigned(item.readsChange)} | ${item.comments} | ${item.validAssignments} |`,
    ),
    '',
    '## 口径提醒',
    '',
    ...report.cautions.map((item) => `- ${item}`),
    '',
  ]
  return `${lines.join('\n')}\n`
}

function formatRate(value) {
  return value == null ? '不可计算' : `${(value * 100).toFixed(2)}%`
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value)
}

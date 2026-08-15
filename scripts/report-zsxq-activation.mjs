import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { resolveGuardianIntake } from './lib/guardian-intake.mjs'
import { resolveCourseProgress } from './lib/course-progress.mjs'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const asOf = args.asOf || shanghaiDateKey()
const [metrics, tracking, paidPilot, guardianIntakeConfig, courseProgressConfig, platformExecution] = await Promise.all([
  readJson(args.metrics || 'ops/campaigns/ai-native-generation-30d-zsxq-metrics.json'),
  readJson(args.tracking || 'ops/campaigns/ai-native-generation-30d-tracking-links.json'),
  readJson(args.paidPilot || 'ops/campaigns/ai-native-generation-30d-paid-pilot.json'),
  readJson(args.guardianIntake || 'ops/campaigns/ai-native-generation-30d-guardian-intake.json'),
  readJson(args.courseProgress || 'ops/campaigns/ai-native-generation-30d-course-progress.json'),
  readJson(args.platforms || 'ops/campaigns/ai-native-generation-30d-platform-execution.json'),
])
const latestRaw = metrics.snapshots.at(-1)
if (!latestRaw) throw new Error('缺少知识星球指标快照。')
const previousRaw = metrics.snapshots.at(-2) || null
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
const missingFieldChanges = buildMissingFieldChanges(previousRaw, latestRaw)
const startTopic = (latest.content || []).find((item) => item.calendarEntryId === 'w1-zsxq-start') || null

const snapshotAgeDays = dayDifference(latest.capturedAt.slice(0, 10), asOf)
const pinPolicy = platformExecution.platforms?.zsxq?.pinPolicy || null
const diagnosis = diagnose({ asOf, latest, startTopic, missingFieldChanges, snapshotAgeDays, tracking, paidPilot, pinPolicy })
const report = {
  campaignId: metrics.campaignId,
  asOf,
  latestSnapshot: latest.capturedAt,
  guardianIntake,
  courseProgress,
  missingFieldChanges,
  startTopic: startTopic ? {
    calendarEntryId: startTopic.calendarEntryId,
    publishedAt: startTopic.publishedAt,
    publicUrl: startTopic.publicUrl,
    reads: startTopic.reads,
    comments: startTopic.comments,
    likes: startTopic.likes,
    validAssignments: startTopic.validAssignments,
    elapsedHoursAtSnapshot: elapsedHours(startTopic.publishedAt, latest.capturedAt),
  } : null,
  snapshotAgeDays,
  pinPolicy,
  primaryAction: diagnosis.primaryAction,
  evidence: diagnosis.evidence,
  secondaryChecks: buildSecondaryChecks({ tracking, paidPilot, latest }),
  forbiddenActions: [
    '不把阅读、点赞或跨帖人数相加后充当独立家庭任务完成。',
    '不自动改价、发优惠券、开启付款或制造限时名额。',
    '不读取、导出或复用浏览器 cookies、localStorage、密码或会话文件。',
    '不收集儿童姓名、学校、位置、正脸、声音、聊天、账号或原始作品。',
  ],
  externalWritesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))

function parseArgs(values) {
  const parsed = { asOf: '', courseProgress: '', guardianIntake: '', json: false, metrics: '', paidPilot: '', platforms: '', tracking: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--course-progress') parsed.courseProgress = values[++index] || ''
    else if (value === '--guardian-intake') parsed.guardianIntake = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--metrics') parsed.metrics = values[++index] || ''
    else if (value === '--paid-pilot') parsed.paidPilot = values[++index] || ''
    else if (value === '--platforms') parsed.platforms = values[++index] || ''
    else if (value === '--tracking') parsed.tracking = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.asOf)) throw new Error('--as-of 必须是 YYYY-MM-DD。')
  return parsed
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(path.resolve(projectDir, filename), 'utf8'))
}

function diagnose({ asOf, latest, startTopic, missingFieldChanges, snapshotAgeDays, tracking, paidPilot, pinPolicy }) {
  if (snapshotAgeDays > 2) {
    return action(
      'refresh_metrics',
      '先刷新真实后台快照',
      '当前数据超过两天。先通过知识星球可见后台追加结构化快照，再决定内容或转化动作。',
      '最新快照日期距今天不超过两天，且所有无法确认字段保持原值或明确为 0。',
      '快照更新前不依据旧数据改选题、改价或判断任务失败。',
      [`快照已滞后 ${snapshotAgeDays} 天`],
    )
  }
  const dominantMissingField = selectDominantMissingField(missingFieldChanges)
  if (dominantMissingField.count > 0) {
    return action(
      'repair_start_field',
      `只补首帖的“${dominantMissingField.label}”一格`,
      `本次新增不完整回复最常缺“${dominantMissingField.label}”。只给这一格的固定补写提示，不要求重写其他四格，也不发布第二个任务。`,
      `下一次快照中“${dominantMissingField.label}”新增缺失次数不再上升，且 startedWeek1Families 增加。`,
      '同一家庭补齐五格后停止追问；没有新缺失时不重复提醒。',
      Object.entries(missingFieldChanges).map(([field, count]) => `${missingFieldLabel(field)}新增缺失 ${count}`),
      {
        mode: 'reply_only',
        replyTemplate: `已经有四格了，只补“${dominantMissingField.label}”即可。继续用一行回复，不需要介绍孩子或家庭情况。`,
        publishNewTopic: false,
      },
    )
  }
  if (startTopic && latest.startedWeek1Families === 0) {
    const hoursSincePublication = elapsedHours(startTopic.publishedAt, latest.capturedAt)
    if (hoursSincePublication < 24) {
      return action(
        'observe_first_24h',
        '保留唯一起点，等待首个完整家庭回复',
        `起点主题已经公开 ${formatHours(hoursSincePublication)} 小时。继续按回复矩阵处理可见回复，不新增主题、不补星主示范，也不改任务正文。`,
        '满 24 小时前取得首个五格完整的去重家庭，或形成可核验的 24 小时阅读与回复快照。',
        '首个家庭补齐五格后停止等待并进入 L01；未满 24 小时不把零回复判为失败。',
        [`起点已公开 ${formatHours(hoursSincePublication)} 小时`, `阅读 ${startTopic.reads}`, `评论 ${startTopic.comments}`, '开始家庭 0'],
        {
          mode: 'observe_only',
          targetCalendarEntryId: 'w1-zsxq-start',
          publishNewTopic: false,
        },
      )
    }
    if (startTopic.reads > 0) {
      const replyTemplate = '整理三次纸飞机飞行时间｜三组普通数字｜比较表和一句结论｜可能忽略异常值｜孩子复算，家长检查测试安全'
      return action(
        'seed_single_start_example',
        '只在原起点主题补一行示范',
        '起点已满 24 小时且有阅读、没有完整家庭回复。只在原主题补一条星主示范，不发布新主题，不追加课程招生话术。',
        '下一次快照中 startedWeek1Families 增加，或确认示范已经可见且没有重复发送。',
        '示范已可见、出现首个完整家庭回复或遇到儿童数据/平台风控时立即停止；不得重复补示范。',
        [`起点已公开 ${formatHours(hoursSincePublication)} 小时`, `阅读 ${startTopic.reads}`, `评论 ${startTopic.comments}`, '开始家庭 0'],
        {
          mode: 'reply_only_after_duplicate_guard',
          targetCalendarEntryId: 'w1-zsxq-start',
          replyTemplate,
          duplicateGuard: {
            visibleSurface: 'published_start_topic_comments',
            exactMarker: replyTemplate,
            markerPresentAction: '不再回复；只记录示范已可见。',
            markerAbsentAction: '只回复一次固定示范。',
            ambiguousAction: '停止写入；不得用重复回复试探状态。',
          },
          publishNewTopic: false,
        },
      )
    }
    return action(
      'verify_start_entry_visibility',
      '只核验起点入口可见性',
      '起点已满 24 小时但可见阅读仍为 0。只核验公开状态、主题列表入口和现有跨链是否指向该主题；不改正文、不新增主题，也不替换现有置顶。',
      '取得起点主题公开且可从当前星球入口到达的可见证据，或明确记录入口阻断。',
      '入口可见即停止；登录、验证、风控或无法确认时保留现状并记录，不尝试重发。',
      [`起点已公开 ${formatHours(hoursSincePublication)} 小时`, '可见阅读 0', '开始家庭 0'],
      {
        mode: 'visibility_check_only',
        targetCalendarEntryId: 'w1-zsxq-start',
        preserveExistingPinnedTopic: true,
        publishNewTopic: false,
      },
    )
  }
  if (latest.unexpiredMembers > 0 && latest.sevenDayActiveMembers === 0 && latest.startedWeek1Families === 0) {
    const skipExistingPin = pinPolicy?.defaultAction === 'skip_existing_pinned_topic'
    return action(
      'activate_existing_member',
      '只推一个十分钟起点',
      skipExistingPin
        ? '发布“从这里开始”，只要求一行 AI 足迹；已有置顶保持不变，对首条有效回复只追问一个可修改点。'
        : '发布“从这里开始”，只要求一行 AI 足迹；对首条有效回复只追问一个可修改点。',
      '至少 1 个去重家庭补齐场景、输入、输出、错误和检查者五格。',
      '24 小时有阅读无有效回复时，不增加第二个任务，只补一条示范。',
      [`有效期内成员 ${latest.unexpiredMembers}`, '7 日活跃为 0', '第一周明确开始家庭为 0'],
      {
        mode: skipExistingPin ? 'publish_skip_existing_pin' : 'publish_only',
        publishAsset: 'content/campaigns/ai-native-generation-30d/2026-08-12-zsxq-start-here-publish.txt',
        pinAction: skipExistingPin ? 'skip_existing_pinned_topic' : 'none',
        ...(skipExistingPin && pinPolicy?.existingPinnedTopicSummary
          ? { preservedPinnedTopicSummary: pinPolicy.existingPinnedTopicSummary }
          : {}),
        firstValidReplyTemplate: '这一步已经完成。你找到了具体场景，也把最后的检查责任留给了真人。只再想一个问题：你准备怎样检查这处最可能的错误？不用补充孩子个人信息。',
        publishNewTopic: true,
      },
    )
  }
  if (asOf <= '2026-08-12' && latest.startedWeek1Families > 0) {
    return action(
      'advance_to_l01',
      '保留起点入口，等待 L01',
      '首帖已经有家庭补齐五格。今天不再追加任务；保留入口与单点反馈，8 月 13 日按计划发布 L01 公开试听和家庭 AI 足迹任务。',
      'L01 公开主题与视频可播放证据分别登记，首帖开始家庭不被误记为课程开始或有效完成。',
      'L01 发布前不催交第二次；若出现新的缺失格，只回复那一格。',
      [`开始 ${latest.startedWeek1Families}`, `有效完成 ${latest.validWeek1Families}`, 'L01 尚未到发布日期'],
    )
  }
  if (latest.startedWeek1Families > latest.validWeek1Families) {
    return action(
      'repair_first_task',
      '修复第一步完成摩擦',
      '只回复尚未完成家庭缺少的一格，不发布新长文；把任务压缩成固定一行。',
      'validWeek1Families 增加，且不通过阅读量补数。',
      '开始家庭全部完成或连续 48 小时没有新增有效回复后再评估。',
      [`开始 ${latest.startedWeek1Families}`, `有效完成 ${latest.validWeek1Families}`],
    )
  }
  if (latest.challengeStartedFamilies > latest.challengeCompletedFamilies) {
    return action(
      'repair_challenge',
      '只修三天挑战掉队阶段',
      '比较开始、Day 2 和完成家庭数；只给掉队最大阶段一个固定回复模板，不启动新挑战。',
      'challengeCompletedFamilies 增加且不大于 Day 2、不大于开始家庭。',
      '掉队阶段连续两次复盘没有改善时，下一轮删除一个任务要求。',
      [
        `开始 ${latest.challengeStartedFamilies}`,
        `Day 2 ${latest.challengeDay2Families}`,
        `完成 ${latest.challengeCompletedFamilies}`,
      ],
    )
  }
  if (latest.researchProjectStartedFamilies > latest.researchProjectCompletedFamilies) {
    return action(
      'repair_research',
      '只修研究日志或完成环节',
      '优先补原始记录、异常、AI 取舍或局限中缺失的一项，不要求家庭重新包装作品。',
      'researchLogFamilies 或 researchProjectCompletedFamilies 增加。',
      '完成家庭数达到日志家庭数，或明确记录无法继续的安全/时间原因。',
      [
        `研究开始 ${latest.researchProjectStartedFamilies}`,
        `日志 ${latest.researchLogFamilies}`,
        `完成 ${latest.researchProjectCompletedFamilies}`,
      ],
    )
  }
  if (latest.safetyCheckpointFamilies > latest.familyAgreementFamilies
    || latest.familyAgreementFamilies > latest.defenseCompletedFamilies) {
    return action(
      'repair_closing',
      '修复安全门到答辩的单一断点',
      '若公约掉队，把口号改成触发与动作；若答辩掉队，只保留三个终课问题。',
      'familyAgreementFamilies 或 defenseCompletedFamilies 增加且保持阶段顺序。',
      '修复较弱阶段后再邀请下一轮，不用答辩分数推动付费。',
      [
        `安全门 ${latest.safetyCheckpointFamilies}`,
        `公约 ${latest.familyAgreementFamilies}`,
        `答辩 ${latest.defenseCompletedFamilies}`,
      ],
    )
  }
  if (latest.qualifiedGuardianInterests > 0 && paidPilot.paymentEnabled !== true) {
    const missing = (paidPilot.requiredBeforePayment || []).filter((field) => paidPilot.offer?.[field] == null)
    return action(
      'complete_offer_gates',
      '先补齐课程内测要约门禁',
      `已有监护人意向，但付款仍关闭。只确认价格、周期、家庭上限、退款、支付和支持边界等 ${missing.length} 项，不催付款。`,
      '七项付款字段全部确认，监护人可在付款前完整看到交付与边界。',
      '门禁未齐前保持 intake_only；不得把意向记成付费。',
      [`监护人意向 ${latest.qualifiedGuardianInterests}`, `付款状态 ${paidPilot.status}`],
    )
  }
  if (latest.campaignPaidPageVisitors < 5) {
    return action(
      'increase_qualified_traffic',
      '增加可归因的合格访问',
      tracking.status === 'active'
        ? '从当天表现最好的家长问题稿保留一个入口，增加付费页合格访问，不同时改页面文案。'
        : '课程页渠道仍未启用；继续使用已核验的知识星球公开链接承接，不使用课程页或 UTM。',
      '活动归因付费页访问达到 5 个去重家庭，或明确记录渠道门禁仍阻断。',
      '达到 5 个访问后停止加流量，转而检查点击；不要同时改流量和价值说明。',
      [`活动归因付费页访问 ${latest.campaignPaidPageVisitors}`, `渠道状态 ${tracking.status}`],
    )
  }
  if (latest.campaignJoinClickers === 0) {
    return action(
      'repair_paid_page_value',
      '只修付费页价值说明',
      '把加入后第一步、12 节课、任务反馈和明确不承诺放在首屏；本轮不改价格。',
      '出现至少 1 个可归因加入点击。',
      '获得 5 次新访问后再判断；访问不足时不把零点击归因于文案。',
      [`活动归因访问 ${latest.campaignPaidPageVisitors}`, '加入点击为 0'],
    )
  }
  if (latest.campaignJoinClickers >= 5 && latest.newPaidFamilies === 0) {
    return action(
      'inspect_price_trust_payment',
      '检查价格、信任与支付路径',
      '人工核验当前价格、付款页、权益说明和支付是否可达；记录问题，不自动改价或发券。',
      '明确定位为价格、信任、支付路径或仍证据不足之一。',
      '没有完成路径核验前不创建优惠，不把儿童焦虑用于成交。',
      [`加入点击 ${latest.campaignJoinClickers}`, '新增星球付费为 0'],
    )
  }
  if (latest.courseStartedFamilies > latest.courseCompletedFamilies) {
    return action(
      'repair_course_completion',
      '只修课程完成断点',
      '找到首次掉队课次，只减少一个任务要求或补一个示例，不增加新模块。',
      'courseCompletedFamilies 增加，或明确记录不可继续原因。',
      '完成率达到 50% 后停止减负，检查学习证据质量。',
      [`课程开始 ${latest.courseStartedFamilies}`, `课程完成 ${latest.courseCompletedFamilies}`],
    )
  }
  return action(
    'continue_current_experiment',
    '保持当前唯一实验',
    '继续执行当周任务与反馈，不同时修改流量、文案、价格和课程结构。',
    '下一次结构化快照能说明唯一变量的变化。',
    '到周复盘时再选择下一变量。',
    ['当前没有更高优先级的阶段断点'],
  )
}

function buildMissingFieldChanges(previous, latest) {
  const fields = ['scene', 'input', 'output', 'error', 'checker']
  return Object.fromEntries(fields.map((field) => [
    field,
    Math.max(0, (latest.week1MissingFieldCounts?.[field] || 0)
      - (previous?.week1MissingFieldCounts?.[field] || 0)),
  ]))
}

function selectDominantMissingField(changes) {
  const fields = ['scene', 'input', 'output', 'error', 'checker']
  return fields
    .map((field) => ({ field, label: missingFieldLabel(field), count: changes[field] || 0 }))
    .sort((left, right) => right.count - left.count)[0]
}

function missingFieldLabel(field) {
  return { scene: '场景', input: '输入', output: '输出', error: '错误', checker: '检查者' }[field]
}

function action(id, focus, instruction, successEvidence, stopCondition, evidence, execution = null) {
  return {
    primaryAction: { id, focus, instruction, successEvidence, stopCondition, execution },
    evidence,
  }
}

function buildSecondaryChecks({ tracking, paidPilot, latest }) {
  const checks = []
  if (tracking.status !== 'active') checks.push(`课程页渠道为 ${tracking.status}；不要使用课程页 UTM。`)
  if (paidPilot.paymentEnabled !== true) checks.push(`课程内测为 ${paidPilot.status}；只收监护人意向，不收费。`)
  if (latest.thirtyDayPreviewVisitors > 0) checks.push('近 30 日付费页数据仅作滚动背景，不补入活动归因字段。')
  return checks
}

function dayDifference(from, to) {
  return Math.floor((Date.parse(`${to}T00:00:00+08:00`) - Date.parse(`${from}T00:00:00+08:00`)) / 86400000)
}

function elapsedHours(from, to) {
  return Math.max(0, (Date.parse(to) - Date.parse(from)) / 3_600_000)
}

function formatHours(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function renderMarkdown(report) {
  const action = report.primaryAction
  return [
    '# 知识星球今日唯一动作',
    '',
    `- 截止：${report.asOf}`,
    `- 最新快照：${report.latestSnapshot}（滞后 ${report.snapshotAgeDays} 天）`,
    `- 诊断：${action.id}`,
    `- 今日焦点：${action.focus}`,
    `- 执行动作：${action.instruction}`,
    `- 成功证据：${action.successEvidence}`,
    `- 停止条件：${action.stopCondition}`,
    ...(action.execution ? [
      `- 执行模式：${action.execution.mode}`,
      ...(action.execution.publishAsset ? [`- 唯一载荷：${action.execution.publishAsset}`] : []),
      ...(action.execution.pinAction ? [`- 置顶动作：${action.execution.pinAction}`] : []),
      ...(action.execution.preservedPinnedTopicSummary
        ? [`- 保留现有置顶：${action.execution.preservedPinnedTopicSummary}`]
        : []),
      ...(action.execution.replyTemplate ? [`- 固定回复：${action.execution.replyTemplate}`] : []),
      ...(action.execution.firstValidReplyTemplate ? [`- 首条有效反馈：${action.execution.firstValidReplyTemplate}`] : []),
      `- 是否新增主题：${action.execution.publishNewTopic ? '是' : '否'}`,
    ] : []),
    '',
    '## 诊断证据',
    '',
    ...report.evidence.map((item) => `- ${item}`),
    '',
    '## 同步检查',
    '',
    ...(report.secondaryChecks.length ? report.secondaryChecks.map((item) => `- ${item}`) : ['- 无']),
    '',
    '## 禁止动作',
    '',
    ...report.forbiddenActions.map((item) => `- ${item}`),
    '',
    '> 本报告只读取本地聚合指标，不执行发布、改价、付款、私信或登录凭证读取。',
    '',
  ].join('\n')
}

function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

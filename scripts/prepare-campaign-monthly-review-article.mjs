import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const asOf = args.asOf || shanghaiDateKey()
const report = runMonthlyReport(asOf, args)
const outputFile = path.resolve(
  projectDir,
  args.output || 'content/posts/ai-native-generation-30d-monthly-review.mdx',
)

if (report.finalizationState !== 'final_ready') {
  const blocked = {
    campaignId: report.campaignId,
    asOf,
    state: 'blocked_final_evidence',
    finalizationState: report.finalizationState,
    decision: report.decision,
    output: path.relative(projectDir, outputFile),
    content: null,
    writesPerformed: false,
    externalWritesPerformed: false,
    reason: `最终网站稿不得生成：月报仍为 ${report.finalizationState}。`,
  }
  process.stdout.write(args.json ? `${JSON.stringify(blocked, null, 2)}\n` : renderBlocked(blocked))
  process.exit(0)
}

const content = buildArticle(report)
const contentSha256 = crypto.createHash('sha256').update(content).digest('hex')
if (args.apply) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true })
  await fs.writeFile(outputFile, content, { encoding: 'utf8', flag: 'wx' })
}
const result = {
  campaignId: report.campaignId,
  asOf,
  state: 'draft_ready',
  finalizationState: report.finalizationState,
  decision: report.decision,
  latestMetricSnapshot: report.latestMetricSnapshot,
  output: path.relative(projectDir, outputFile),
  contentSha256,
  content,
  publicationGate: 'published=false；仍需网站部署授权、作者复核和生产页核验。',
  writesPerformed: args.apply,
  externalWritesPerformed: false,
}
process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : content)

function parseArgs(values) {
  const parsed = {
    apply: false,
    asOf: '',
    calendars: [],
    campaign: '',
    guardianIntake: '',
    json: false,
    log: '',
    metrics: '',
    output: '',
    paidPilot: '',
    tracking: '',
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--apply') parsed.apply = true
    else if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--calendar') parsed.calendars.push(values[++index] || '')
    else if (value === '--campaign') parsed.campaign = values[++index] || ''
    else if (value === '--guardian-intake') parsed.guardianIntake = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--metrics') parsed.metrics = values[++index] || ''
    else if (value === '--output') parsed.output = values[++index] || ''
    else if (value === '--paid-pilot') parsed.paidPilot = values[++index] || ''
    else if (value === '--tracking') parsed.tracking = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.asOf)) throw new Error('--as-of 必须是 YYYY-MM-DD。')
  if (parsed.calendars.some((value) => !value)) throw new Error('--calendar 不能为空。')
  return parsed
}

function runMonthlyReport(asOf, values) {
  const command = [path.resolve(projectDir, 'scripts/report-campaign-monthly-review.mjs'), '--as-of', asOf, '--json']
  for (const [key, flag] of [
    ['campaign', '--campaign'],
    ['metrics', '--metrics'],
    ['log', '--log'],
    ['tracking', '--tracking'],
    ['paidPilot', '--paid-pilot'],
    ['guardianIntake', '--guardian-intake'],
  ]) {
    if (values[key]) command.push(flag, values[key])
  }
  for (const calendar of values.calendars) command.push('--calendar', calendar)
  return JSON.parse(execFileSync(process.execPath, command, { cwd: projectDir, encoding: 'utf8' }))
}

function buildArticleBase(report) {
  const decision = decisionCopy(report.decision.state)
  const platformRows = report.contentSupply.byPlatform.map((item) =>
    `| ${platformLabel(item.platform)} | ${item.planned} | ${item.ready} | ${item.blocked} | ${report.execution.verifiedPublishesByPlatform[item.platform] || 0} |`,
  ).join('\n')
  const frontmatter = [
    '---',
    `title: "AI 原生一代 30 天试运行复盘：${decision.title}"`,
    'description: "用家庭任务、连续完成、知识星球与课程内测漏斗复盘儿童 AI 素养试运行；阅读量不代替学习与产品证据。"',
    `date: ${report.asOf}T20:30:00+08:00`,
    'author: 芝士AI吃鱼',
    'tags:',
    '  - "AI原生一代"',
    '  - "儿童AI素养"',
    '  - "课程复盘"',
    '  - "知识星球"',
    'icon: chart',
    'published: false',
    'topicId: "ai-native-generation-30d-review"',
    'topicCluster: "ai-native-generation"',
    '---',
    '',
  ].join('\n')
  return `${frontmatter}一个月试运行结束后，最容易展示的是发了多少篇、获得多少阅读。它们能证明内容持续生产，却不能证明家庭真正开始学习，也不能证明课程已经成为产品。\n\n本次最终结论是：**${decision.title}**。${decision.explanation}\n\n> 数据截止 ${report.asOf}；最新知识星球聚合快照为 ${report.latestMetricSnapshot}。所有数字均为去标识化汇总，不包含儿童或家庭可识别信息。\n\n## 内容供给不等于真实发布\n\n| 平台 | 规划 | 本地就绪 | 阻断 | 已核验发布 |\n|---|---:|---:|---:|---:|\n${platformRows}\n\n本地稿件、视频和配图准备完成，不等于平台已经公开。只有取得真实公开 URL 并核验正文状态的内容才计入“已核验发布”。\n\n## 家庭从哪里开始，又在哪里停下\n\n- 第一周：明确开始 ${report.funnel.firstWeek.started} 个家庭，有效完成 ${report.funnel.firstWeek.completed} 个家庭。\n- 三天挑战：开始 ${report.funnel.challenge.started}，进入 Day 2 ${report.funnel.challenge.day2}，完成 ${report.funnel.challenge.completed}。\n- 家庭研究：开始 ${report.funnel.research.started}，提交研究日志 ${report.funnel.research.logged}，完成 ${report.funnel.research.completed}。\n- 安全与答辩：完成安全门 ${report.funnel.safetyAndDefense.safetyCheckpoint}，形成家庭公约 ${report.funnel.safetyAndDefense.familyAgreement}，完成答辩 ${report.funnel.safetyAndDefense.defenseCompleted}。\n\n没有可靠开始人数时，我们只报告绝对数，不用阅读人数补分母，也不生成看似精确的完成率。\n\n## 知识星球和课程内测是两条漏斗\n\n活动归因的知识星球付费页访问为 ${report.funnel.planet.attributablePaidPageVisitors}，加入点击 ${report.funnel.planet.joinClickers}，新增星球付费家庭 ${report.funnel.planet.newPaidFamilies}。\n\n课程内测收到 ${report.funnel.courseBeta.guardianInterests} 个有效监护人意向；课程内测付费 ${report.funnel.courseBeta.paidFamilies}，明确开始 ${report.funnel.courseBeta.started}，完成 ${report.funnel.courseBeta.completed}。这组数字不与知识星球付费相加。\n\n监护人另行明确授权的去标识化反馈为 ${report.funnel.authorizedFeedbackCount} 条。作业提交本身不等于同意公开。\n\n## 仍未解除的门禁\n\n- 课程页归因状态：${report.gates.trackingStatus}。\n- 课程内测状态：${report.gates.paidPilotStatus}；付款 enabled=${report.gates.paymentEnabled}。\n- 尚未确认的付款要约字段：${report.gates.missingOfferFields.length ? report.gates.missingOfferFields.join('、') : '无'}。\n- 网站阻断条目：${report.gates.websiteBlockedEntries}。\n\n如果课程页没有公开，零访问不能证明没有需求；如果付款门禁没有开启，零课程付费也不能证明价格错误。\n\n## 第二个月只做一个主要调整\n\n${decision.nextAction}\n\n监护人如希望了解下一轮，可通过公众号私信“儿童AI内测-网站”，只发送年龄段、每周可共同投入时间和参与偏好。当前是否收费、价格、周期、退款和支持边界，以届时完整说明为准；付款门禁未齐前只登记意向。\n\n本复盘不公开儿童姓名、学校、位置、照片、声音、账号、聊天、健康资料、原始作品或可识别家庭信息，也不把生成式配图和合成内容解释为真实学员或课程效果。\n`
}

function buildArticle(report) {
  const article = buildArticleBase(report)
  const terminalFailures = report.execution.terminalFailures || []
  const section = terminalFailures.length
    ? `## 未发布与终局失败\n\n以下记录没有取得已核验公开证据，因此不计入“已核验发布”。这里仅保留运营级结果和后续安全动作，不公开原始失败证据或账号信息。\n\n| 平台 | 内容 | 核验时间 | 结果 | 后续安全动作 |\n|---|---|---|---|---|\n${terminalFailures.map((item) => `| ${escapeTableCell(platformLabel(item.platform))} | ${escapeTableCell(item.title)} | ${escapeTableCell(item.attemptedAt)} | ${escapeTableCell(item.outcome)} | ${escapeTableCell(item.safeNextAction)} |`).join('\n')}\n\n`
    : '## 未发布与终局失败\n\n本周期没有登记终局失败。普通待重试尝试仍保持待核验，不会在这里冒充最终结果。\n\n'
  return article.replace(
    '## 家庭从哪里开始，又在哪里停下',
    `${section}## 家庭从哪里开始，又在哪里停下`,
  )
}

function escapeTableCell(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
}

function decisionCopy(state) {
  const values = {
    continue_and_scale: {
      title: '继续并扩大验证',
      explanation: '激活、产品与完成证据达到本轮预设门槛，但一个月结果仍不能外推为普遍课程效果。',
      nextAction: '保持课程主线，下一轮只扩大可核验家庭样本；不同时改价格、任务结构和流量入口。',
    },
    continue_with_funnel_repair: {
      title: '继续，但只修一个漏斗断点',
      explanation: '已经出现家庭行动或产品信号，但核心目标没有同时满足。',
      nextAction: '根据阶段数据选择掉队最明显的一段，只调整一个任务门槛或反馈环节；其他变量保持不变。',
    },
    insufficient_evidence: {
      title: '证据不足，不宣布模式成立或失败',
      explanation: '关键课程入口或付款门禁仍未开放，零转化无法被解释为无需求。',
      nextAction: '先解除一个关键测量门禁，再重复相同任务与口径；不通过新增内容数量掩盖证据缺口。',
    },
    stop_or_redesign: {
      title: '停止或重做课程假设',
      explanation: '入口与执行均可用，但没有观察到可重复的家庭行动或产品信号。',
      nextAction: '停止扩大量产内容，回到家长问题、任务门槛与交付价值，重新定义一个可验证假设。',
    },
  }
  const value = values[state]
  if (!value) throw new Error(`不支持的月末决策：${state}`)
  return value
}

function platformLabel(value) {
  return { website: '网站', wechat: '公众号', csdn: 'CSDN', x: 'X', toutiao: '今日头条', zsxq: '知识星球', video: '课程视频' }[value] || value
}

function renderBlocked(result) {
  return `# 月末网站复盘文章\n\n- 状态：${result.state}\n- 最终化：${result.finalizationState}\n- 原因：${result.reason}\n- 写入：否\n`
}

function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const asOf = args.asOf || shanghaiDateKey()
const queueFile = path.resolve(
  projectDir,
  args.queue || 'ops/campaigns/ai-native-generation-30d-research-queue.json',
)
const logFile = path.resolve(
  projectDir,
  args.log || 'ops/campaigns/ai-native-generation-30d-log.json',
)
const [queue, log] = await Promise.all([
  fs.readFile(queueFile, 'utf8').then(JSON.parse),
  fs.readFile(logFile, 'utf8').then(JSON.parse),
])
const evidenceMapFile = path.resolve(projectDir, queue.evidenceMap || '')
const evidenceMap = await fs.readFile(evidenceMapFile, 'utf8').then(JSON.parse)
const invalid = []
const missingOutputs = []
const missingExecutionPacks = []
const executionPackChecks = []
validateQueue(queue, evidenceMap, invalid)

for (const task of queue.tasks || []) {
  if (task.executionPack) {
    const executionPackPath = path.resolve(projectDir, task.executionPack)
    const exists = await fs.stat(executionPackPath).then((stat) => stat.isFile()).catch(() => false)
    if (!exists) missingExecutionPacks.push(`${task.id}:${task.executionPack}`)
    else {
      const content = await fs.readFile(executionPackPath, 'utf8')
      const requiredMarkers = task.id === 'R01'
        ? ['S02', 'S03', 'S04', 'S05', '9 个', '课程自研支架', '仍未知', '不得生成虚构家长引语', 'Chrome Cookie', task.outputAssets[0]]
        : []
      const missingMarkers = requiredMarkers.filter((marker) => !content.includes(marker))
      executionPackChecks.push({ taskId: task.id, asset: task.executionPack, missingMarkers })
      if (missingMarkers.length) invalid.push(`${task.id}:执行包缺少 ${missingMarkers.join('、')}`)
    }
  }
  for (const asset of task.outputAssets || []) {
    const exists = await fs.stat(path.resolve(projectDir, asset)).then((stat) => stat.isFile()).catch(() => false)
    if (task.status === 'completed_verified' && !exists) missingOutputs.push(`${task.id}:${asset}`)
  }
}

const incomplete = (queue.tasks || [])
  .filter((task) => task.status !== 'completed_verified')
  .sort((left, right) => left.dueOn.localeCompare(right.dueOn) || left.id.localeCompare(right.id))
const dueTasks = incomplete.filter((task) => task.dueOn <= asOf)
const nextTask = incomplete[0] || null
const notebook = log.notebooklm || {}
const execution = selectExecution({ dueTasks, nextTask, notebook })
const report = {
  campaignId: queue.campaignId,
  asOf,
  state: invalid.length || missingOutputs.length || missingExecutionPacks.length ? 'blocked' : 'ready',
  notebook: {
    status: notebook.status || 'unknown',
    cliAuth: notebook.cliAuth || 'unknown',
    notebookId: notebook.notebookId || null,
  },
  counts: {
    tasks: (queue.tasks || []).length,
    completed: (queue.tasks || []).filter((task) => task.status === 'completed_verified').length,
    planned: incomplete.length,
    due: dueTasks.length,
  },
  dueTasks,
  nextTask,
  execution,
  policy: queue.policy,
  missingOutputs,
  missingExecutionPacks,
  executionPackChecks,
  invalid,
  externalWritesPerformed: false,
}

if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
else process.stdout.write(renderMarkdown(report))
if (report.state !== 'ready') process.exitCode = 1

function validateQueue(queue, evidenceMap, invalid) {
  if (queue.version !== 1) invalid.push('研究队列版本必须为 1')
  if (queue.campaignId !== 'ai-native-generation-30d') invalid.push('campaignId 不匹配')
  if (queue.evidenceMap !== 'ops/campaigns/ai-native-generation-30d-course-evidence-map.json') {
    invalid.push('研究队列 evidenceMap 不匹配')
  }
  const sourceIds = new Set((evidenceMap.sources || []).map((source) => source.id))
  const taskIds = new Set()
  const allowedStatuses = new Set(['planned', 'completed_verified'])
  for (const task of queue.tasks || []) {
    if (taskIds.has(task.id)) invalid.push(`${task.id}:任务 ID 重复`)
    taskIds.add(task.id)
    if (!/^R\d{2}$/.test(task.id || '')) invalid.push(`${task.id || '未命名'}:任务 ID 无效`)
    if (!/^2026-\d{2}-\d{2}$/.test(task.dueOn || '')) invalid.push(`${task.id}:dueOn 无效`)
    if (!allowedStatuses.has(task.status)) invalid.push(`${task.id}:状态无效`)
    if (!task.topic || !task.query) invalid.push(`${task.id}:缺少主题或研究问题`)
    if (!Array.isArray(task.sourceIds) || !task.sourceIds.length) invalid.push(`${task.id}:缺少来源`)
    else if (task.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) invalid.push(`${task.id}:引用未知来源`)
    if (!Array.isArray(task.outputAssets) || !task.outputAssets.length) invalid.push(`${task.id}:缺少输出素材`)
    if (!Array.isArray(task.editorialTargets) || !task.editorialTargets.length) invalid.push(`${task.id}:缺少编辑目标`)
  }
  const policyText = Object.values(queue.policy || {}).join('\n')
  for (const marker of ['不直接生成可发布事实', '官方或一手原文', '在线重验', 'Chrome Cookie', '课程教学假设', '仍未知']) {
    if (!policyText.includes(marker)) invalid.push(`研究队列策略缺少：${marker}`)
  }
  const safetyTask = (queue.tasks || []).find((task) => task.id === 'R04')
  const week1Task = (queue.tasks || []).find((task) => task.id === 'R01')
  if (week1Task?.executionPack !== 'content/campaigns/ai-native-generation-30d/2026-08-13-notebooklm-r01-execution-pack.md') {
    invalid.push('R01 缺少限定来源研究执行包')
  }
  if (!safetyTask?.mustReverifyOnline) invalid.push('R04 必须在线重验高风险来源')
  for (const sourceId of ['S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12']) {
    if (!safetyTask?.sourceIds?.includes(sourceId)) invalid.push(`R04 缺少 ${sourceId}`)
  }
}

function selectExecution({ dueTasks, nextTask, notebook }) {
  if (!nextTask) return {
    mode: 'queue_complete',
    instruction: '研究队列已完成；只在出现来源更新或真实运营问题时新增任务。',
  }
  if (!dueTasks.length) return {
    mode: 'wait_until_due',
    taskId: nextTask.id,
    dueOn: nextTask.dueOn,
    instruction: `下一项 ${nextTask.id} 尚未到期；保持现有内容计划，不提前制造研究结论。`,
  }
  const task = dueTasks[0]
  if (notebook.cliAuth === 'ready') return {
    mode: 'cli_or_visible_browser',
    taskId: task.id,
    dueOn: task.dueOn,
    instruction: '使用独立 NotebookLM 认证或可见浏览器执行限定来源研究；保存笔记后仍回到原始来源复核。',
    recordWith: buildRecordCommand(task),
  }
  if (notebook.status === 'browser_operational_cli_pending') return {
    mode: 'visible_browser_only',
    taskId: task.id,
    dueOn: task.dueOn,
    instruction: 'CLI 认证未完成；只可使用已核验的 NotebookLM 可见网页研究，不读取、导出或复用 Chrome Cookie。',
    recordWith: buildRecordCommand(task),
  }
  return {
    mode: 'blocked_auth',
    taskId: task.id,
    dueOn: task.dueOn,
    instruction: 'NotebookLM 当前不可用；保留研究任务，不用搜索摘要或模型记忆补写结论。',
  }
}

function buildRecordCommand(task) {
  const sources = (task.sourceIds || []).map((sourceId) => `--verified-source ${sourceId}`).join(' ')
  return `node scripts/record-campaign-research-task.mjs --task ${task.id} --completed-at <ISO> ${sources} --source-citations-verified --privacy-verified --apply`
}

function parseArgs(values) {
  const parsed = { asOf: '', json: false, log: '', queue: '' }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--as-of') parsed.asOf = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--log') parsed.log = values[++index] || ''
    else if (value === '--queue') parsed.queue = values[++index] || ''
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.asOf)) throw new Error('--as-of 必须是 YYYY-MM-DD。')
  return parsed
}

function renderMarkdown(report) {
  const lines = [
    '# NotebookLM 研究任务队列',
    '',
    `- 截止：${report.asOf}`,
    `- 状态：${report.state}`,
    `- 完成 / 计划 / 到期：${report.counts.completed} / ${report.counts.planned} / ${report.counts.due}`,
    `- 执行模式：${report.execution.mode}`,
    `- 当前动作：${report.execution.instruction}`,
    '',
  ]
  if (report.nextTask) lines.push(`- 下一任务：${report.nextTask.id}｜${report.nextTask.dueOn}｜${report.nextTask.topic}`, '')
  lines.push('> 本报告只读取本地队列和运营状态，不执行 NotebookLM 写入、登录、Cookie 读取或外部发布。', '')
  return lines.join('\n')
}

function shanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

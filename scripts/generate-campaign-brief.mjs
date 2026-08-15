import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const projectDir = process.cwd()
const args = parseArgs(process.argv.slice(2))
const campaignFile = path.resolve(projectDir, args.file || 'ops/campaigns/ai-native-generation-30d.json')
const dateKey = args.date || shanghaiDateKey()
const campaign = JSON.parse(await fs.readFile(campaignFile, 'utf8'))

validateCampaign(campaign)
const day = campaign.days.find((item) => item.date === dateKey)
if (!day) {
  const message = `${dateKey} 不在活动周期 ${campaign.startsOn} 至 ${campaign.endsOn} 内。`
  if (args.optional) process.exit(0)
  throw new Error(message)
}

const lessons = campaign.courseLessons.filter((lesson) => lesson.week === day.week)
const brief = {
  campaignId: campaign.id,
  campaignName: campaign.name,
  date: dateKey,
  week: day.week,
  focus: day.focus,
  primaryChannel: day.primaryChannel,
  asset: day.asset,
  articleTopic: day.articleTopic,
  cta: day.cta,
  weekLessons: lessons,
  audience: campaign.primaryAudience,
  productPromise: campaign.productPromise,
  guardrails: campaign.guardrails,
  platformRole: campaign.platforms[day.primaryChannel] || null,
}

if (args.field) {
  const value = brief[args.field]
  if (value == null || typeof value === 'object') throw new Error(`字段 ${args.field} 不存在或不是标量。`)
  process.stdout.write(String(value))
} else if (args.json) {
  process.stdout.write(`${JSON.stringify(brief, null, 2)}\n`)
} else {
  process.stdout.write(renderMarkdown(brief))
}

function parseArgs(values) {
  const parsed = { date: '', file: '', field: '', json: false, optional: false }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--date') parsed.date = values[++index] || ''
    else if (value === '--file') parsed.file = values[++index] || ''
    else if (value === '--field') parsed.field = values[++index] || ''
    else if (value === '--json') parsed.json = true
    else if (value === '--optional') parsed.optional = true
    else throw new Error(`未知参数：${value}`)
  }
  if (parsed.date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) throw new Error('--date 必须是 YYYY-MM-DD。')
  return parsed
}

function validateCampaign(value) {
  if (!value || typeof value !== 'object') throw new Error('活动配置无效。')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.startsOn || '') || !/^\d{4}-\d{2}-\d{2}$/.test(value.endsOn || '')) {
    throw new Error('活动起止日期无效。')
  }
  if (!Array.isArray(value.days) || value.days.length !== 30) throw new Error('30 天活动必须恰好配置 30 个执行日。')
  if (!Array.isArray(value.courseLessons) || value.courseLessons.length !== 12) throw new Error('课程必须配置 12 节核心课。')
  const dates = new Set()
  for (const day of value.days) {
    if (!day.date || dates.has(day.date)) throw new Error(`活动日期重复或缺失：${day.date || 'unknown'}`)
    dates.add(day.date)
    for (const field of ['focus', 'primaryChannel', 'asset', 'articleTopic', 'cta']) {
      if (typeof day[field] !== 'string' || !day[field].trim()) throw new Error(`${day.date} 缺少 ${field}。`)
    }
  }
}

function renderMarkdown(brief) {
  const lessons = brief.weekLessons.map((lesson) => `- ${lesson.id}：${lesson.title}`).join('\n')
  const guardrails = brief.guardrails.map((item) => `- ${item}`).join('\n')
  return `# ${brief.date} 运营简报\n\n- 活动：${brief.campaignName}\n- 周次：第 ${brief.week} 周\n- 今日重点：${brief.focus}\n- 主平台：${brief.primaryChannel}\n- 交付物：${brief.asset}\n- 母选题：${brief.articleTopic}\n- 转化动作：${brief.cta}\n\n## 本周课程\n\n${lessons}\n\n## 公开边界\n\n${guardrails}\n`
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

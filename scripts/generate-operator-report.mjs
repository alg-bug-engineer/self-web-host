#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import nextEnv from '@next/env'

const projectDir = process.cwd()
nextEnv.loadEnvConfig(projectDir)
const dataDir = process.env.ANALYTICS_DATA_DIR || path.join(projectDir, 'data')
const analyticsPath = path.join(dataDir, 'analytics.json')
const reportDir = path.join(dataDir, 'operator')
const latestReportPath = path.join(reportDir, 'latest.json')
const historyPath = path.join(reportDir, 'history.jsonl')
const goalsPath = path.join(projectDir, 'ops/operator-goals.json')

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

const dateKey = (offset = 0) => {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() - offset)
  return value.toISOString().slice(0, 10)
}

const dateRange = (days, offset = 0) =>
  Array.from({ length: days }, (_, index) => dateKey(index + offset))

const sum = (values) => values.reduce((total, value) => total + value, 0)
const percentChange = (current, previous) => previous
  ? Math.round(((current - previous) / previous) * 1000) / 10
  : null

const goals = await readJson(goalsPath, null)
if (!goals?.objective?.target) throw new Error('缺少有效的 ops/operator-goals.json')

const store = await readJson(analyticsPath, { days: {} })
const analyticsDays = store.days && typeof store.days === 'object' ? store.days : {}
const current28Days = dateRange(28)
const previous28Days = dateRange(28, 28)
const current7Days = dateRange(7)
const previous7Days = dateRange(7, 7)

const visitorsFor = (days) => sum(days.map((day) => analyticsDays[day]?.visitors?.length || 0))
const pageViewsFor = (days) => sum(days.map((day) => Number(analyticsDays[day]?.pageViews) || 0))
const returningVisitorsFor = (days) => sum(days.map((day) => analyticsDays[day]?.returningVisitors?.length || 0))
const engagementSignalsForDay = (day) => Object.values(analyticsDays[day]?.engagement || {})
  .flatMap((signals) => Object.values(signals || {}))
const engagedVisitorsFor = (days) => sum(days.map((day) => {
  const visitors = new Set()
  for (const signals of Object.values(analyticsDays[day]?.engagement || {})) {
    for (const [visitor, signal] of Object.entries(signals || {})) {
      if (Number(signal?.seconds || 0) >= 10 || Number(signal?.depth || 0) >= 25) visitors.add(visitor)
    }
  }
  return visitors.size
}))
const currentVisitors = visitorsFor(current28Days)
const previousVisitors = visitorsFor(previous28Days)
const currentPageViews = pageViewsFor(current28Days)
const current7Visitors = visitorsFor(current7Days)
const previous7Visitors = visitorsFor(previous7Days)
const returningVisitors = returningVisitorsFor(current28Days)
const engagedVisitors = engagedVisitorsFor(current28Days)
const currentEngagementSignals = current28Days.flatMap(engagementSignalsForDay)
const depth50Visitors = currentEngagementSignals.filter((signal) => Number(signal?.depth || 0) >= 50).length
const depth90Visitors = currentEngagementSignals.filter((signal) => Number(signal?.depth || 0) >= 90).length
const returningRate = currentVisitors ? Math.min(100, Math.round((returningVisitors / currentVisitors) * 1000) / 10) : 0
const engagementRate = currentVisitors ? Math.min(100, Math.round((engagedVisitors / currentVisitors) * 1000) / 10) : 0
const activeDays = current28Days.filter((day) => analyticsDays[day]).length
const projectedMonthlyVisitors = activeDays
  ? Math.round((currentVisitors / activeDays) * 30)
  : 0

const pathTotals = {}
const sourceTotals = {}
for (const day of current28Days) {
  const daily = analyticsDays[day]
  if (!daily) continue
  for (const [pathname, views] of Object.entries(daily.paths || {})) {
    pathTotals[pathname] = (pathTotals[pathname] || 0) + Number(views || 0)
  }
  for (const [source, visitors] of Object.entries(daily.sources || {})) {
    sourceTotals[source] = (sourceTotals[source] || 0) + Number(visitors || 0)
  }
}

const topPages = Object.entries(pathTotals)
  .sort((left, right) => right[1] - left[1])
  .slice(0, 10)
  .map(([pathname, views]) => ({ pathname, views }))
const topSources = Object.entries(sourceTotals)
  .sort((left, right) => right[1] - left[1])
  .slice(0, 10)
  .map(([source, visitors]) => ({ source, visitors }))
const searchVisitors = sum(topSources
  .filter((item) => item.source.startsWith('search:'))
  .map((item) => item.visitors))
const searchShare = currentVisitors ? Math.round((searchVisitors / currentVisitors) * 1000) / 10 : 0

const observations = []
const recommendedActions = []

if (!activeDays) {
  observations.push('尚无生产访问数据，无法评估增长。')
  recommendedActions.push({
    priority: 1,
    type: 'instrumentation',
    action: '验证首页、文章页和来源统计是否写入生产数据目录。',
    reviewRequired: false,
  })
} else {
  observations.push(`最近 28 天已有 ${activeDays} 个自然日产生统计数据。`)
  observations.push(`按现有日均速度推算月度访客为目标的 ${Math.round((projectedMonthlyVisitors / goals.objective.target) * 1000) / 10}%。`)
  if (current7Visitors < previous7Visitors) {
    recommendedActions.push({
      priority: 1,
      type: 'diagnosis',
      action: '检查近 7 天流量下降对应的来源和落地页，先排除收录、链接与可用性异常。',
      reviewRequired: false,
    })
  }
  if (searchShare < 20) {
    recommendedActions.push({
      priority: 2,
      type: 'seo',
      action: '选择一个已有高价值页面，核对索引、标题、摘要、FAQ 与站内链接，不批量生成页面。',
      reviewRequired: true,
    })
  }
  if (currentVisitors >= 20 && engagementRate < 25) {
    recommendedActions.push({
      priority: 2,
      type: 'reading-experience',
      action: '有效阅读率低于 25%，优先检查访问最高页面的首屏承诺、正文结构、移动端可读性与相关文章入口。',
      reviewRequired: true,
    })
  }
  if (topPages[0]) {
    recommendedActions.push({
      priority: 3,
      type: 'content',
      action: `围绕当前高访问页面 ${topPages[0].pathname} 补充一条自然的相关文章入口，并评估 7 天后的阅读深度。`,
      reviewRequired: true,
    })
  }
}

const report = {
  version: 2,
  generatedAt: new Date().toISOString(),
  objective: goals.objective,
  status: {
    current28DayVisitors: currentVisitors,
    previous28DayVisitors: previousVisitors,
    visitorChangePercent: percentChange(currentVisitors, previousVisitors),
    current28DayPageViews: currentPageViews,
    current7DayVisitors: current7Visitors,
    previous7DayVisitors: previous7Visitors,
    sevenDayChangePercent: percentChange(current7Visitors, previous7Visitors),
    projectedMonthlyVisitors,
    gapToTarget: Math.max(0, goals.objective.target - projectedMonthlyVisitors),
    activeDays,
    confidence: activeDays >= 21 ? 'medium' : activeDays >= 7 ? 'low' : 'insufficient',
  },
  quality: {
    returningVisitors,
    returningRatePercent: returningRate,
    engagedVisitors,
    engagementRatePercent: engagementRate,
    depth50Visitors,
    depth90Visitors,
  },
  acquisition: { searchVisitors, searchSharePercent: searchShare, topSources },
  topPages,
  observations,
  recommendedActions,
  constraints: goals.constraints,
}

await fs.mkdir(reportDir, { recursive: true, mode: 0o700 })
await fs.writeFile(latestReportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
await fs.appendFile(historyPath, `${JSON.stringify(report)}\n`, { mode: 0o600 })

console.log(`内部经营报告已生成：${latestReportPath}`)
console.log(`数据完整度：${report.status.confidence}；建议动作：${recommendedActions.length} 项`)

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
const technicalAuditPath = path.join(reportDir, 'technical-latest.json')
const searchConsolePath = path.join(reportDir, 'search-console-latest.json')
const actionsPath = path.join(reportDir, 'actions.json')
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
const coreWebVitalNames = ['LCP', 'INP', 'CLS']
const coreWebVitalThresholds = {
  LCP: { good: 2_500, poor: 4_000, unit: 'ms' },
  INP: { good: 200, poor: 500, unit: 'ms' },
  CLS: { good: 0.1, poor: 0.25, unit: 'score' },
}
const percentile75 = (values) => {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)]
}
const vitalRating = (name, value) => {
  if (value === null) return 'insufficient-data'
  const threshold = coreWebVitalThresholds[name]
  if (value <= threshold.good) return 'good'
  return value > threshold.poor ? 'poor' : 'needs-improvement'
}

const goals = await readJson(goalsPath, null)
if (!goals?.objective?.target) throw new Error('缺少有效的 ops/operator-goals.json')

const store = await readJson(analyticsPath, { days: {} })
const technicalAudit = await readJson(technicalAuditPath, null)
const searchConsole = await readJson(searchConsolePath, null)
const actionState = await readJson(actionsPath, { actions: [] })
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
const qualifiedVisitorsFor = (days) => sum(days.map((day) => {
  const daily = analyticsDays[day]
  const visitors = new Set(Array.isArray(daily?.returningVisitors) ? daily.returningVisitors : [])
  for (const signals of Object.values(daily?.engagement || {})) {
    for (const [visitor, signal] of Object.entries(signals || {})) {
      if (Number(signal?.seconds || 0) >= 10 || Number(signal?.depth || 0) >= 25) visitors.add(visitor)
    }
  }
  return visitors.size
}))
const currentVisitors = visitorsFor(current28Days)
const previousVisitors = visitorsFor(previous28Days)
const currentQualifiedVisitors = qualifiedVisitorsFor(current28Days)
const previousQualifiedVisitors = qualifiedVisitorsFor(previous28Days)
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
const projectedMonthlyQualifiedVisitors = activeDays
  ? Math.round((currentQualifiedVisitors / activeDays) * 30)
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
const coreWebVitalValues = Object.fromEntries(coreWebVitalNames.map((name) => [name, []]))
const coreWebVitalPathValues = {}
for (const day of current28Days) {
  for (const [pathname, metrics] of Object.entries(analyticsDays[day]?.vitals || {})) {
    coreWebVitalPathValues[pathname] ||= Object.fromEntries(coreWebVitalNames.map((name) => [name, []]))
    for (const name of coreWebVitalNames) {
      const values = Object.values(metrics?.[name] || {}).filter((value) => Number.isFinite(Number(value))).map(Number)
      coreWebVitalValues[name].push(...values)
      coreWebVitalPathValues[pathname][name].push(...values)
    }
  }
}
const coreWebVitals = coreWebVitalNames.map((name) => {
  const p75 = percentile75(coreWebVitalValues[name])
  return {
    name,
    p75,
    samples: coreWebVitalValues[name].length,
    unit: coreWebVitalThresholds[name].unit,
    rating: vitalRating(name, p75),
  }
})
const slowestVitalPages = coreWebVitalNames.flatMap((name) => {
  const candidates = Object.entries(coreWebVitalPathValues)
    .map(([pathname, metrics]) => ({ pathname, name, p75: percentile75(metrics[name]), samples: metrics[name].length }))
    .filter((item) => item.p75 !== null && item.samples >= 5)
    .sort((left, right) => right.p75 - left.p75)
  return candidates.slice(0, 1)
})

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
  observations.push(`按现有日均速度推算月度有效访客为目标的 ${Math.round((projectedMonthlyQualifiedVisitors / goals.objective.target) * 1000) / 10}%。`)
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

const actionableVital = coreWebVitals.find((metric) =>
  metric.samples >= 10 && (metric.rating === 'poor' || metric.rating === 'needs-improvement'))
if (actionableVital) {
  const slowPage = slowestVitalPages.find((item) => item.name === actionableVital.name)
  recommendedActions.push({
    priority: actionableVital.rating === 'poor' ? 1 : 2,
    type: 'performance',
    action: `${actionableVital.name} 第 75 百分位未达良好阈值${slowPage ? `，优先检查 ${slowPage.pathname}` : ''}；先定位资源、主线程或布局位移原因，再做单项低风险优化。`,
    reviewRequired: true,
  })
}

if (!technicalAudit) {
  recommendedActions.push({
    priority: 1,
    type: 'technical-audit',
    action: '运行生产技术巡检，验证 Sitemap、索引、结构化数据、RSS 与内部链接。',
    reviewRequired: false,
  })
} else if (technicalAudit.status !== 'healthy') {
  recommendedActions.push({
    priority: 1,
    type: 'technical-seo',
    action: `修复技术巡检发现的 ${technicalAudit.metrics?.errors || 0} 个错误和 ${technicalAudit.metrics?.warnings || 0} 个警告，优先处理不可访问页面与索引冲突。`,
    reviewRequired: false,
  })
} else if (Number(technicalAudit.metrics?.warnings || 0) > 0) {
  recommendedActions.push({
    priority: 3,
    type: 'technical-seo',
    action: `评估技术巡检中的 ${technicalAudit.metrics.warnings} 个警告，确认是否需要低风险修复。`,
    reviewRequired: false,
  })
}

if (!searchConsole || searchConsole.status === 'unconfigured') {
  recommendedActions.push({
    priority: 2,
    type: 'search-instrumentation',
    action: '配置 Google Search Console 只读服务账号，接入真实曝光、点击、CTR、排名、查询词和落地页数据。',
    reviewRequired: true,
  })
} else if (searchConsole.status === 'error') {
  recommendedActions.push({
    priority: 1,
    type: 'search-instrumentation',
    action: '修复 Google Search Console 数据授权或 API 连接；保留站内统计运行，不根据缺失搜索数据做 SEO 结论。',
    reviewRequired: true,
  })
} else if (searchConsole.status === 'connected') {
  const summary = searchConsole.summary || {}
  observations.push(`Google Search Console 最近 28 天记录 ${summary.clicks || 0} 次点击、${summary.impressions || 0} 次曝光，CTR ${summary.ctrPercent || 0}%。`)
  if (Number(summary.impressions || 0) >= 100 && Number(summary.ctrPercent || 0) < 2) {
    const opportunity = searchConsole.topQueries?.find((item) => Number(item.impressions || 0) >= 20)
      || searchConsole.topPages?.find((item) => Number(item.impressions || 0) >= 20)
    recommendedActions.push({
      priority: 2,
      type: 'search-ctr',
      action: `Search Console 的 28 天 CTR 低于 2%${opportunity ? `；优先评估“${opportunity.query || opportunity.page}”` : ''}，核对搜索意图、标题和摘要后只做单页实验。`,
      reviewRequired: true,
    })
  }
}

const report = {
  version: 6,
  generatedAt: new Date().toISOString(),
  objective: goals.objective,
  status: {
    current28DayVisitors: currentVisitors,
    previous28DayVisitors: previousVisitors,
    visitorChangePercent: percentChange(currentVisitors, previousVisitors),
    current28DayQualifiedVisitorDays: currentQualifiedVisitors,
    previous28DayQualifiedVisitorDays: previousQualifiedVisitors,
    qualifiedVisitorDayChangePercent: percentChange(currentQualifiedVisitors, previousQualifiedVisitors),
    current28DayPageViews: currentPageViews,
    current7DayVisitors: current7Visitors,
    previous7DayVisitors: previous7Visitors,
    sevenDayChangePercent: percentChange(current7Visitors, previous7Visitors),
    projectedMonthlyVisitors,
    projectedMonthlyQualifiedVisitorDays: projectedMonthlyQualifiedVisitors,
    gapToTarget: Math.max(0, goals.objective.target - projectedMonthlyQualifiedVisitors),
    activeDays,
    confidence: activeDays >= 21 ? 'medium' : activeDays >= 7 ? 'low' : 'insufficient',
    measurement: {
      unit: 'qualifiedVisitorDays',
      dailyDeduplicated: true,
      crossDayDeduplicated: false,
      note: '隐私化访客哈希每日轮换；该值是有效访客天数，不是跨 28 天完全去重的月 UV。',
    },
  },
  quality: {
    returningVisitors,
    returningRatePercent: returningRate,
    engagedVisitors,
    engagementRatePercent: engagementRate,
    depth50Visitors,
    depth90Visitors,
  },
  acquisition: {
    referrerEstimate: { searchVisitors, searchSharePercent: searchShare, topSources },
    searchConsole: searchConsole ? {
      status: searchConsole.status,
      generatedAt: searchConsole.generatedAt,
      property: searchConsole.property,
      range: searchConsole.range || null,
      summary: searchConsole.summary || null,
      topQueries: (searchConsole.topQueries || []).slice(0, 20),
      topPages: (searchConsole.topPages || []).slice(0, 20),
      error: searchConsole.status === 'error' ? searchConsole.error : undefined,
    } : null,
  },
  experience: {
    coreWebVitals,
    slowestPages: slowestVitalPages,
    percentile: 75,
    thresholds: coreWebVitalThresholds,
    note: '来自真实浏览器的现场数据；样本不足时不做性能结论。',
  },
  technical: technicalAudit ? {
    checkedAt: technicalAudit.checkedAt,
    status: technicalAudit.status,
    metrics: technicalAudit.metrics,
    issues: technicalAudit.issues,
  } : null,
  learning: {
    definition: actionState.definition || null,
    totalActions: actionState.actions?.length || 0,
    observingActions: actionState.actions?.filter((action) => action.status === 'observing').length || 0,
    evaluatedActions: actionState.actions?.filter((action) => action.status === 'evaluated').length || 0,
    insufficientDataActions: actionState.actions?.filter((action) => action.status === 'insufficient-data').length || 0,
    recentActions: (actionState.actions || []).slice(0, 5).map((action) => ({
      id: action.id,
      category: action.category,
      title: action.title,
      commit: action.commit,
      deployedAt: action.deployedAt,
      status: action.status,
      observationEnds: action.observationEnds,
      outcome: action.outcome,
      confidence: action.confidence,
      changes: action.changes || null,
    })),
  },
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

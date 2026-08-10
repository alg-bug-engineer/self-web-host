#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import nextEnv from '@next/env'

const projectDir = process.cwd()
nextEnv.loadEnvConfig(projectDir)
const dataDir = process.env.ANALYTICS_DATA_DIR || path.join(projectDir, 'data')
const operatorDir = path.join(dataDir, 'operator')
const analyticsPath = path.join(dataDir, 'analytics.json')
const deploymentsPath = path.join(operatorDir, 'deployments.jsonl')
const actionsPath = path.join(operatorDir, 'actions.json')
const goalsPath = path.join(projectDir, 'ops', 'operator-goals.json')

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

const readJsonLines = async (file) => {
  const content = await fs.readFile(file, 'utf8').catch(() => '')
  return content.split('\n').filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
}

const goals = await readJson(goalsPath, {})
const boundedDays = (value, fallback) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(28, Math.max(3, Math.round(numeric))) : fallback
}
const beforeWindowDays = boundedDays(goals?.learning?.beforeWindowDays, 7)
const afterWindowDays = boundedDays(goals?.learning?.afterWindowDays, 7)
const minimumActiveDays = Math.min(
  beforeWindowDays,
  afterWindowDays,
  boundedDays(goals?.learning?.minimumActiveDaysPerWindow, 5),
)

const shiftDay = (day, offset) => {
  const value = new Date(`${day}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + offset)
  return value.toISOString().slice(0, 10)
}

const rangeFrom = (startDay, days) =>
  Array.from({ length: days }, (_, index) => shiftDay(startDay, index))

const sum = (values) => values.reduce((total, value) => total + value, 0)
const round = (value) => Math.round(value * 10) / 10
const percentChange = (current, previous) => previous > 0
  ? round(((current - previous) / previous) * 100)
  : null
const percentile75 = (values) => {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)]
}

const analytics = await readJson(analyticsPath, { days: {} })
const analyticsDays = analytics?.days && typeof analytics.days === 'object' ? analytics.days : {}

const scorecardFor = (days) => {
  let visitors = 0
  let pageViews = 0
  let articlePageViews = 0
  let returningVisitors = 0
  let engagedVisitors = 0
  let qualifiedVisitors = 0
  let activeDays = 0
  const webVitalValues = { LCP: [], INP: [], CLS: [] }

  for (const day of days) {
    const daily = analyticsDays[day]
    if (!daily) continue
    activeDays += 1
    const dailyVisitors = new Set(Array.isArray(daily.visitors) ? daily.visitors : [])
    const returning = new Set(Array.isArray(daily.returningVisitors) ? daily.returningVisitors : [])
    const engaged = new Set()
    for (const signals of Object.values(daily.engagement || {})) {
      for (const [visitor, signal] of Object.entries(signals || {})) {
        if (Number(signal?.seconds || 0) >= 10 || Number(signal?.depth || 0) >= 25) engaged.add(visitor)
      }
    }
    const qualified = new Set([...returning, ...engaged])
    visitors += dailyVisitors.size
    returningVisitors += returning.size
    engagedVisitors += engaged.size
    qualifiedVisitors += qualified.size
    pageViews += Number(daily.pageViews || 0)
    articlePageViews += sum(Object.entries(daily.paths || {})
      .filter(([pathname]) => pathname.startsWith('/blog/'))
      .map(([, views]) => Number(views || 0)))
    for (const metrics of Object.values(daily.vitals || {})) {
      for (const name of Object.keys(webVitalValues)) {
        webVitalValues[name].push(...Object.values(metrics?.[name] || {}).map(Number).filter(Number.isFinite))
      }
    }
  }

  return {
    activeDays,
    visitors,
    engagedVisitors,
    qualifiedVisitors,
    pageViews,
    articlePageViews,
    engagementRatePercent: visitors ? round((engagedVisitors / visitors) * 100) : 0,
    returningRatePercent: visitors ? round((returningVisitors / visitors) * 100) : 0,
    coreWebVitals: {
      LCP: { p75: percentile75(webVitalValues.LCP), samples: webVitalValues.LCP.length },
      INP: { p75: percentile75(webVitalValues.INP), samples: webVitalValues.INP.length },
      CLS: { p75: percentile75(webVitalValues.CLS), samples: webVitalValues.CLS.length },
    },
  }
}

const classify = (files) => {
  if (files.some((file) => file.startsWith('content/'))) return 'content'
  if (files.some((file) => /(?:sitemap|robots|llms|metadata|structured|seo)/i.test(file))) return 'seo'
  if (files.some((file) => file.startsWith('src/app/') || file.startsWith('src/components/'))) return 'product'
  if (files.some((file) => file.startsWith('.github/') || file.startsWith('scripts/'))) return 'operations'
  return 'maintenance'
}

const deployments = await readJsonLines(deploymentsPath)
const previousState = await readJson(actionsPath, { actions: [] })
const previousByCommit = new Map((previousState.actions || []).map((action) => [action.commit, action]))
const today = (process.env.OPERATOR_NOW || new Date().toISOString()).slice(0, 10)

const actions = deployments
  .filter((event) => /^[0-9a-f]{40}$/i.test(event?.commit || '') && event?.deployedAt)
  .filter((event, index, events) => events.findIndex((candidate) => candidate.commit === event.commit) === index)
  .map((event) => {
    const deployedDay = event.deployedAt.slice(0, 10)
    const beforeDays = rangeFrom(shiftDay(deployedDay, -beforeWindowDays), beforeWindowDays)
    const afterStart = shiftDay(deployedDay, 1)
    const afterDays = rangeFrom(afterStart, afterWindowDays)
    const observationEnds = afterDays.at(-1)
    const before = scorecardFor(beforeDays)
    const after = scorecardFor(afterDays)
    const previous = previousByCommit.get(event.commit)
    const base = {
      id: `action-${event.commit.slice(0, 12)}`,
      type: 'deployment',
      category: classify(event.changedFiles || []),
      title: event.subject || `部署 ${event.commit.slice(0, 12)}`,
      commit: event.commit,
      previousCommit: event.previousCommit,
      deployedAt: event.deployedAt,
      changedFiles: event.changedFiles || [],
      beforeWindowDays,
      afterWindowDays,
      before,
      after,
    }

    if (today <= observationEnds) {
      return { ...base, status: 'observing', observationEnds, outcome: null, confidence: 'insufficient' }
    }

    if (before.activeDays < minimumActiveDays || after.activeDays < minimumActiveDays) {
      return {
        ...base,
        status: 'insufficient-data',
        observationEnds,
        outcome: null,
        confidence: 'insufficient',
        evaluatedAt: previous?.evaluatedAt || new Date().toISOString(),
      }
    }

    const sufficientVitalSamples = (name) =>
      before.coreWebVitals[name].samples >= minimumActiveDays &&
      after.coreWebVitals[name].samples >= minimumActiveDays
    const changes = {
      qualifiedVisitorsPercent: percentChange(after.qualifiedVisitors, before.qualifiedVisitors),
      visitorsPercent: percentChange(after.visitors, before.visitors),
      articlePageViewsPercent: percentChange(after.articlePageViews, before.articlePageViews),
      engagementRatePoints: round(after.engagementRatePercent - before.engagementRatePercent),
      returningRatePoints: round(after.returningRatePercent - before.returningRatePercent),
      lcpP75Percent: sufficientVitalSamples('LCP')
        ? percentChange(after.coreWebVitals.LCP.p75, before.coreWebVitals.LCP.p75)
        : null,
      inpP75Percent: sufficientVitalSamples('INP')
        ? percentChange(after.coreWebVitals.INP.p75, before.coreWebVitals.INP.p75)
        : null,
      clsP75Points: sufficientVitalSamples('CLS') && after.coreWebVitals.CLS.p75 !== null && before.coreWebVitals.CLS.p75 !== null
        ? Math.round((after.coreWebVitals.CLS.p75 - before.coreWebVitals.CLS.p75) * 10_000) / 10_000
        : null,
    }
    const positiveSignals = [
      changes.qualifiedVisitorsPercent !== null && changes.qualifiedVisitorsPercent >= 5,
      changes.articlePageViewsPercent !== null && changes.articlePageViewsPercent >= 5,
      changes.engagementRatePoints >= 2,
      changes.returningRatePoints >= 1,
      changes.lcpP75Percent !== null && changes.lcpP75Percent <= -5,
      changes.inpP75Percent !== null && changes.inpP75Percent <= -5,
      changes.clsP75Points !== null && changes.clsP75Points <= -0.02,
    ].filter(Boolean).length
    const negativeSignals = [
      changes.qualifiedVisitorsPercent !== null && changes.qualifiedVisitorsPercent <= -5,
      changes.articlePageViewsPercent !== null && changes.articlePageViewsPercent <= -5,
      changes.engagementRatePoints <= -2,
      changes.returningRatePoints <= -1,
      changes.lcpP75Percent !== null && changes.lcpP75Percent >= 5,
      changes.inpP75Percent !== null && changes.inpP75Percent >= 5,
      changes.clsP75Points !== null && changes.clsP75Points >= 0.02,
    ].filter(Boolean).length
    const outcome = positiveSignals >= 2 && negativeSignals === 0
      ? 'positive-signal'
      : negativeSignals >= 2 && positiveSignals === 0
        ? 'negative-signal'
        : 'mixed-signal'
    const sample = before.qualifiedVisitors + after.qualifiedVisitors

    return {
      ...base,
      status: 'evaluated',
      observationEnds,
      outcome,
      confidence: sample >= 100 ? 'medium' : 'low',
      changes,
      evaluatedAt: previous?.evaluatedAt || new Date().toISOString(),
      caveat: '结果表示部署前后相关性，不单独证明因果关系。',
    }
  })
  .sort((left, right) => right.deployedAt.localeCompare(left.deployedAt))
  .slice(0, 200)

const state = {
  version: 1,
  generatedAt: new Date().toISOString(),
  definition: {
    qualifiedVisitor: '当日阅读至少 10 秒、达到 25% 阅读深度或具有回访信号的隐私化访客。',
    evaluation: `对比部署前 ${beforeWindowDays} 个自然日与部署后 ${afterWindowDays} 个完整自然日；至少各有 ${minimumActiveDays} 个数据日才给出结果。`,
    causalityPolicy: goals?.learning?.causalityPolicy || '部署前后变化只作为相关性信号。',
  },
  actions,
}

await fs.mkdir(operatorDir, { recursive: true, mode: 0o700 })
await fs.chmod(operatorDir, 0o700).catch(() => undefined)
await fs.writeFile(actionsPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
await fs.chmod(actionsPath, 0o600).catch(() => undefined)

const observing = actions.filter((action) => action.status === 'observing').length
const evaluated = actions.filter((action) => action.status === 'evaluated').length
console.log(`经营行动学习完成：${actions.length} 条；观察中 ${observing}；已评估 ${evaluated}`)
console.log(`私有账本：${actionsPath}`)

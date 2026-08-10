import 'server-only'

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

type DailyAnalytics = {
  pageViews: number
  visitors: string[]
  paths: Record<string, number>
  pathVisitors: Record<string, string[]>
  sources: Record<string, number>
  landingPaths: Record<string, number>
}

type AnalyticsStore = {
  version: 2
  days: Record<string, DailyAnalytics>
}

export type AnalyticsOverview = {
  days: number
  pageViews: number
  dailyVisitors: number
  previousPageViews: number
  previousDailyVisitors: number
  pageViewChange: number | null
  visitorChange: number | null
  topPaths: Array<{ pathname: string; views: number; visitors: number }>
  topSources: Array<{ source: string; visitors: number }>
  topLandingPaths: Array<{ pathname: string; visitors: number }>
  timeline: Array<{ date: string; pageViews: number; visitors: number }>
}

type TrafficContext = {
  source?: string
}

const emptyStore = (): AnalyticsStore => ({ version: 2, days: {} })
const emptyDay = (): DailyAnalytics => ({
  pageViews: 0,
  visitors: [],
  paths: {},
  pathVisitors: {},
  sources: {},
  landingPaths: {},
})

const analyticsDataDir =
  process.env.ANALYTICS_DATA_DIR ||
  path.join(process.cwd(), 'data')

const analyticsFile = path.join(analyticsDataDir, 'analytics.json')
let writeQueue: Promise<unknown> = Promise.resolve()

function numberRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, count]) => Number.isFinite(count) && Number(count) >= 0)
      .map(([key, count]) => [key, Number(count)]),
  )
}

function visitorRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([key, visitors]) => [
      key,
      Array.isArray(visitors) ? visitors.filter((item): item is string => typeof item === 'string') : [],
    ]),
  )
}

function normalizeDay(value: unknown): DailyAnalytics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyDay()
  const candidate = value as Partial<DailyAnalytics>
  return {
    pageViews: Number.isFinite(candidate.pageViews) ? Number(candidate.pageViews) : 0,
    visitors: Array.isArray(candidate.visitors)
      ? candidate.visitors.filter((item): item is string => typeof item === 'string')
      : [],
    paths: numberRecord(candidate.paths),
    pathVisitors: visitorRecord(candidate.pathVisitors),
    sources: numberRecord(candidate.sources),
    landingPaths: numberRecord(candidate.landingPaths),
  }
}

function normalizeStore(value: unknown): AnalyticsStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyStore()
  const candidate = value as { days?: unknown }
  if (!candidate.days || typeof candidate.days !== 'object' || Array.isArray(candidate.days)) {
    return emptyStore()
  }

  return {
    version: 2,
    days: Object.fromEntries(
      Object.entries(candidate.days).map(([day, analytics]) => [day, normalizeDay(analytics)]),
    ),
  }
}

async function readStore(): Promise<AnalyticsStore> {
  try {
    return normalizeStore(JSON.parse(await fs.readFile(analyticsFile, 'utf8')))
  } catch {
    return emptyStore()
  }
}

async function writeStore(store: AnalyticsStore) {
  await fs.mkdir(analyticsDataDir, { recursive: true })
  const temporaryFile = `${analyticsFile}.${process.pid}.tmp`
  await fs.writeFile(temporaryFile, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 })
  await fs.rename(temporaryFile, analyticsFile)
}

function analyticsRetentionDays() {
  const configured = Number(process.env.ANALYTICS_RETENTION_DAYS || 400)
  return Number.isFinite(configured) ? Math.min(1095, Math.max(90, Math.floor(configured))) : 400
}

export function normalizeAnalyticsPath(value: string) {
  const pathname = value.trim().split(/[?#]/, 1)[0]
  if (!pathname.startsWith('/') || pathname.length > 240) return null
  if (pathname.startsWith('/api/') || pathname.startsWith('/admin')) return null
  return pathname.replace(/\/{2,}/g, '/')
}

export function createVisitorHash(input: string, day: string) {
  const salt =
    process.env.ANALYTICS_HASH_SALT ||
    process.env.ADMIN_SESSION_SECRET ||
    'ai-knowledgepoints-local-development-only'
  return crypto.createHash('sha256').update(`${salt}:${day}:${input}`).digest('hex').slice(0, 24)
}

export async function recordPageView(
  pathname: string,
  visitorHash: string,
  context: TrafficContext = {},
) {
  const normalizedPath = normalizeAnalyticsPath(pathname)
  if (!normalizedPath) throw new Error('Invalid analytics path')

  const task = writeQueue.then(async () => {
    const store = await readStore()
    const day = new Date().toISOString().slice(0, 10)
    const daily = store.days[day] || emptyDay()
    const source = context.source?.slice(0, 120) || 'direct'
    const isNewVisitor = !daily.visitors.includes(visitorHash)
    const pathVisitors = daily.pathVisitors[normalizedPath] || []

    // PV counts a real browser session entering the path. UV remains de-duplicated
    // by a daily salted hash, so no raw IP or stable cross-day identity is stored.
    daily.pageViews += 1
    daily.paths[normalizedPath] = (daily.paths[normalizedPath] || 0) + 1

    if (!pathVisitors.includes(visitorHash)) {
      pathVisitors.push(visitorHash)
      daily.pathVisitors[normalizedPath] = pathVisitors
    }

    if (isNewVisitor) {
      daily.visitors.push(visitorHash)
      daily.sources[source] = (daily.sources[source] || 0) + 1
      daily.landingPaths[normalizedPath] = (daily.landingPaths[normalizedPath] || 0) + 1
    }

    store.days[day] = daily

    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - analyticsRetentionDays())
    const cutoffDay = cutoff.toISOString().slice(0, 10)
    for (const storedDay of Object.keys(store.days)) {
      if (storedDay < cutoffDay) delete store.days[storedDay]
    }

    await writeStore(store)
    return {
      views: getPathViewsFromStore(store, normalizedPath),
      visitors: getPathVisitorsFromStore(store, normalizedPath),
    }
  })

  writeQueue = task.catch(() => undefined)
  return task
}

function recentDays(days: number, offset = 0) {
  const result: string[] = []
  const cursor = new Date()
  cursor.setUTCDate(cursor.getUTCDate() - offset)
  for (let index = 0; index < days; index += 1) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return result
}

function getPathViewsFromStore(store: AnalyticsStore, pathname: string, days = 400) {
  return recentDays(days).reduce(
    (total, day) => total + (store.days[day]?.paths[pathname] || 0),
    0,
  )
}

function getPathVisitorsFromStore(store: AnalyticsStore, pathname: string, days = 400) {
  return recentDays(days).reduce(
    (total, day) => total + (store.days[day]?.pathVisitors[pathname]?.length || 0),
    0,
  )
}

export async function getPathViews(pathname: string, days = 400) {
  const normalizedPath = normalizeAnalyticsPath(pathname)
  if (!normalizedPath) return 0
  return getPathViewsFromStore(await readStore(), normalizedPath, days)
}

export async function getTopPaths(options?: { days?: number; prefix?: string; limit?: number }) {
  const { days = 7, prefix = '/', limit = 10 } = options || {}
  const store = await readStore()
  const totals: Record<string, number> = {}

  for (const day of recentDays(days)) {
    for (const [pathname, views] of Object.entries(store.days[day]?.paths || {})) {
      if (pathname.startsWith(prefix)) totals[pathname] = (totals[pathname] || 0) + views
    }
  }

  return Object.entries(totals)
    .sort(([, left], [, right]) => right - left)
    .slice(0, limit)
    .map(([pathname, views]) => ({ pathname, views }))
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function getAnalyticsOverview(days = 30): Promise<AnalyticsOverview> {
  const safeDays = Math.min(365, Math.max(1, Math.floor(days)))
  const store = await readStore()
  const selectedDays = recentDays(safeDays)
  const previousDays = recentDays(safeDays, safeDays)
  const sumPageViews = (dayList: string[]) =>
    dayList.reduce((total, day) => total + (store.days[day]?.pageViews || 0), 0)
  const sumVisitors = (dayList: string[]) =>
    dayList.reduce((total, day) => total + (store.days[day]?.visitors.length || 0), 0)

  const pageViews = sumPageViews(selectedDays)
  const dailyVisitors = sumVisitors(selectedDays)
  const previousPageViews = sumPageViews(previousDays)
  const previousDailyVisitors = sumVisitors(previousDays)
  const pathTotals: Record<string, { views: number; visitors: number }> = {}
  const sourceTotals: Record<string, number> = {}
  const landingTotals: Record<string, number> = {}

  for (const day of selectedDays) {
    const daily = store.days[day]
    if (!daily) continue
    for (const [pathname, views] of Object.entries(daily.paths)) {
      pathTotals[pathname] ||= { views: 0, visitors: 0 }
      pathTotals[pathname].views += views
      pathTotals[pathname].visitors += daily.pathVisitors[pathname]?.length || 0
    }
    for (const [source, visitors] of Object.entries(daily.sources)) {
      sourceTotals[source] = (sourceTotals[source] || 0) + visitors
    }
    for (const [pathname, visitors] of Object.entries(daily.landingPaths)) {
      landingTotals[pathname] = (landingTotals[pathname] || 0) + visitors
    }
  }

  const topPaths = Object.entries(pathTotals)
    .sort(([, left], [, right]) => right.views - left.views)
    .slice(0, 10)
    .map(([pathname, metrics]) => ({ pathname, ...metrics }))
  const topSources = Object.entries(sourceTotals)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 10)
    .map(([source, visitors]) => ({ source, visitors }))
  const topLandingPaths = Object.entries(landingTotals)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 10)
    .map(([pathname, visitors]) => ({ pathname, visitors }))
  const timeline = [...selectedDays].reverse().map((date) => ({
    date,
    pageViews: store.days[date]?.pageViews || 0,
    visitors: store.days[date]?.visitors.length || 0,
  }))

  return {
    days: safeDays,
    pageViews,
    dailyVisitors,
    previousPageViews,
    previousDailyVisitors,
    pageViewChange: percentageChange(pageViews, previousPageViews),
    visitorChange: percentageChange(dailyVisitors, previousDailyVisitors),
    topPaths,
    topSources,
    topLandingPaths,
    timeline,
  }
}

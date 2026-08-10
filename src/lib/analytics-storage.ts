import 'server-only'

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

type DailyAnalytics = {
  pageViews: number
  visitors: string[]
  paths: Record<string, number>
  pathVisitors: Record<string, string[]>
}

type AnalyticsStore = {
  version: 1
  days: Record<string, DailyAnalytics>
}

const emptyStore = (): AnalyticsStore => ({ version: 1, days: {} })

const analyticsDataDir =
  process.env.ANALYTICS_DATA_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/root/self-web-host-data'
    : path.join(process.cwd(), 'data'))

const analyticsFile = path.join(analyticsDataDir, 'analytics.json')
let writeQueue: Promise<unknown> = Promise.resolve()

function normalizeStore(value: unknown): AnalyticsStore {
  if (!value || typeof value !== 'object') return emptyStore()
  const candidate = value as Partial<AnalyticsStore>
  return {
    version: 1,
    days: candidate.days && typeof candidate.days === 'object' ? candidate.days : {},
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
  await fs.writeFile(temporaryFile, JSON.stringify(store), 'utf8')
  await fs.rename(temporaryFile, analyticsFile)
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
    'ai-knowledgepoints-local'
  return crypto.createHash('sha256').update(`${salt}:${day}:${input}`).digest('hex').slice(0, 24)
}

export async function recordPageView(pathname: string, visitorHash: string) {
  const normalizedPath = normalizeAnalyticsPath(pathname)
  if (!normalizedPath) throw new Error('Invalid analytics path')

  const task = writeQueue.then(async () => {
    const store = await readStore()
    const day = new Date().toISOString().slice(0, 10)
    const daily = store.days[day] || { pageViews: 0, visitors: [], paths: {}, pathVisitors: {} }
    daily.pathVisitors ||= {}

    const pathVisitors = daily.pathVisitors[normalizedPath] || []
    if (!pathVisitors.includes(visitorHash)) {
      daily.pageViews += 1
      daily.paths[normalizedPath] = (daily.paths[normalizedPath] || 0) + 1
      pathVisitors.push(visitorHash)
      daily.pathVisitors[normalizedPath] = pathVisitors
    }
    if (!daily.visitors.includes(visitorHash)) daily.visitors.push(visitorHash)
    store.days[day] = daily

    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - 90)
    const cutoffDay = cutoff.toISOString().slice(0, 10)
    for (const storedDay of Object.keys(store.days)) {
      if (storedDay < cutoffDay) delete store.days[storedDay]
    }

    await writeStore(store)
    return getPathViewsFromStore(store, normalizedPath)
  })

  writeQueue = task.catch(() => undefined)
  return task
}

function recentDays(days: number) {
  const result: string[] = []
  const cursor = new Date()
  for (let index = 0; index < days; index += 1) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return result
}

function getPathViewsFromStore(store: AnalyticsStore, pathname: string, days = 90) {
  return recentDays(days).reduce(
    (total, day) => total + (store.days[day]?.paths[pathname] || 0),
    0,
  )
}

export async function getPathViews(pathname: string, days = 90) {
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

export async function getAnalyticsOverview(days = 30) {
  const store = await readStore()
  const selectedDays = recentDays(days)
  const pageViews = selectedDays.reduce(
    (total, day) => total + (store.days[day]?.pageViews || 0),
    0,
  )
  const visitorDays = selectedDays.reduce(
    (total, day) => total + (store.days[day]?.visitors?.length || 0),
    0,
  )
  const pathTotals: Record<string, number> = {}

  for (const day of selectedDays) {
    for (const [pathname, views] of Object.entries(store.days[day]?.paths || {})) {
      pathTotals[pathname] = (pathTotals[pathname] || 0) + views
    }
  }

  const topPaths = Object.entries(pathTotals)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 8)
    .map(([pathname, views]) => ({ pathname, views }))

  return { days, pageViews, visitorDays, topPaths }
}

import 'server-only'

import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import {
  GUARDIAN_SURVEY_QUESTIONS,
  GUARDIAN_SURVEY_TARGET,
  isQualifiedGuardianSurvey,
  normalizeGuardianSurveyAnswers,
} from './guardian-survey'

export const CORE_WEB_VITAL_NAMES = ['LCP', 'INP', 'CLS'] as const
export type CoreWebVitalName = (typeof CORE_WEB_VITAL_NAMES)[number]
export type CoreWebVitalRating = 'good' | 'needs-improvement' | 'poor'

export const CONVERSION_EVENT_NAMES = [
  'explore_articles',
  'view_portfolio',
  'view_book',
  'visit_project',
  'visit_github',
  'view_planet',
  'join_planet',
  'ai_native_generation_interest',
  'course_beta_guardian_interest',
  'ai_literacy_check_complete',
  'course_preview_play',
  'open_tool',
  'subscribe_feed',
  'follow_wechat',
] as const
export type ConversionEventName = (typeof CONVERSION_EVENT_NAMES)[number]

type DailyWebVitals = Record<
  string,
  Partial<Record<CoreWebVitalName, Record<string, number>>>
>

type DailyAnalytics = {
  pageViews: number
  visitors: string[]
  returningVisitors: string[]
  visitorPageViews: Record<string, number>
  paths: Record<string, number>
  pathVisitors: Record<string, string[]>
  engagement: Record<string, Record<string, EngagementSignal>>
  vitals: DailyWebVitals
  sources: Record<string, number>
  visitorSources: Record<string, string>
  landingPaths: Record<string, number>
  conversions: Record<string, DailyConversionEvent>
  conversionCountsByVisitor: Record<string, number>
  guardianSurvey: DailyGuardianSurvey
}

type DailyConversionEvent = {
  count: number
  visitors: string[]
  paths: Record<string, number>
  targets: Record<string, number>
}

type EngagementSignal = {
  seconds: number
  depth: number
}

type DailyGuardianSurvey = {
  submissions: number
  qualifiedSubmissions: number
  visitors: string[]
  answers: Record<string, Record<string, number>>
}

type AnalyticsStore = {
  version: 5
  visitorIdentity: {
    scope: 'calendar-month'
    startedAt: string
    reliableFromDay: string
  }
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
  returningDailyVisitors: number
  engagedDailyVisitors: number
  returningRate: number
  engagementRate: number
  conversionVisitors: number
  conversionRate: number
  topConversions: Array<{
    name: ConversionEventName
    count: number
    visitors: number
    paths: Array<{ pathname: string; count: number }>
    targets: Array<{ target: string; count: number }>
  }>
  webVitals: Array<{
    name: CoreWebVitalName
    p75: number | null
    samples: number
    rating: CoreWebVitalRating | 'insufficient-data'
  }>
  topPaths: Array<{
    pathname: string
    views: number
    visitors: number
    engagedVisitors: number
    depth50Visitors: number
    depth90Visitors: number
    averageEngagedSeconds: number
  }>
  topSources: Array<{ source: string; visitors: number }>
  campaignFunnels: Array<{
    source: string
    visitors: number
    coursePageVisitors: number
    courseInterestVisitors: number
    coursePreviewVisitors: number
    planetJoinVisitors: number
    guardianInterestVisitors: number
    coursePageRate: number
    coursePreviewRate: number
    planetJoinRate: number
    guardianInterestRate: number
  }>
  guardianSurvey: {
    target: number
    submissions: number
    qualifiedSubmissions: number
    progressRate: number
    questions: Array<{
      id: string
      label: string
      options: Array<{ id: string; label: string; count: number }>
    }>
  }
  topLandingPaths: Array<{ pathname: string; visitors: number }>
  timeline: Array<{ date: string; pageViews: number; visitors: number }>
}

type TrafficContext = {
  source?: string
  returningReader?: boolean
}

function nextUtcDay(value: Date) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

const emptyStore = (): AnalyticsStore => {
  const now = new Date()
  return {
    version: 5,
    visitorIdentity: {
      scope: 'calendar-month',
      startedAt: now.toISOString(),
      reliableFromDay: now.toISOString().slice(0, 10),
    },
    days: {},
  }
}
const emptyDay = (): DailyAnalytics => ({
  pageViews: 0,
  visitors: [],
  returningVisitors: [],
  visitorPageViews: {},
  paths: {},
  pathVisitors: {},
  engagement: {},
  vitals: {},
  sources: {},
  visitorSources: {},
  landingPaths: {},
  conversions: {},
  conversionCountsByVisitor: {},
  guardianSurvey: {
    submissions: 0,
    qualifiedSubmissions: 0,
    visitors: [],
    answers: {},
  },
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

function visitorSourceRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([visitor, source]) => {
      if (typeof source !== 'string' || !source.trim()) return []
      return [[visitor, source.trim().slice(0, 120)]]
    }),
  )
}

function engagementRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([pathname, signals]) => {
      if (!signals || typeof signals !== 'object' || Array.isArray(signals)) return [pathname, {}]
      return [pathname, Object.fromEntries(
        Object.entries(signals).flatMap(([visitor, signal]) => {
          if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return []
          const candidate = signal as Partial<EngagementSignal>
          const seconds = Number(candidate.seconds)
          const depth = Number(candidate.depth)
          return [[visitor, {
            seconds: Number.isFinite(seconds) ? Math.min(3600, Math.max(0, Math.round(seconds))) : 0,
            depth: Number.isFinite(depth) ? Math.min(100, Math.max(0, Math.round(depth))) : 0,
          }]]
        }),
      )]
    }),
  )
}

export function normalizeCoreWebVitalName(value: unknown): CoreWebVitalName | null {
  const name = String(value || '').toUpperCase()
  return CORE_WEB_VITAL_NAMES.includes(name as CoreWebVitalName)
    ? name as CoreWebVitalName
    : null
}

function normalizeCoreWebVitalValue(name: CoreWebVitalName, value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  const maximum = name === 'CLS' ? 10 : 60_000
  const clamped = Math.min(maximum, numeric)
  return name === 'CLS'
    ? Math.round(clamped * 10_000) / 10_000
    : Math.round(clamped)
}

function webVitalRecord(value: unknown): DailyWebVitals {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([pathname, metrics]) => {
      if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return []
      const normalizedMetrics = Object.fromEntries(
        Object.entries(metrics).flatMap(([rawName, visitors]) => {
          const name = normalizeCoreWebVitalName(rawName)
          if (!name || !visitors || typeof visitors !== 'object' || Array.isArray(visitors)) return []
          const normalizedVisitors = Object.fromEntries(
            Object.entries(visitors).flatMap(([visitor, rawValue]) => {
              const normalizedValue = normalizeCoreWebVitalValue(name, rawValue)
              return normalizedValue === null ? [] : [[visitor, normalizedValue]]
            }),
          )
          return [[name, normalizedVisitors]]
        }),
      )
      return [[pathname, normalizedMetrics]]
    }),
  )
}

function conversionRecord(value: unknown): Record<string, DailyConversionEvent> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([rawName, rawEvent]) => {
      const name = normalizeConversionEventName(rawName)
      if (!name || !rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) return []
      const candidate = rawEvent as Partial<DailyConversionEvent>
      return [[name, {
        count: Number.isFinite(candidate.count) ? Math.max(0, Number(candidate.count)) : 0,
        visitors: Array.isArray(candidate.visitors)
          ? candidate.visitors.filter((item): item is string => typeof item === 'string').slice(0, 50_000)
          : [],
        paths: numberRecord(candidate.paths),
        targets: numberRecord(candidate.targets),
      }]]
    }),
  )
}

function guardianSurveyRecord(value: unknown): DailyGuardianSurvey {
  const empty: DailyGuardianSurvey = {
    submissions: 0,
    qualifiedSubmissions: 0,
    visitors: [],
    answers: {},
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty
  const candidate = value as Partial<DailyGuardianSurvey>
  const answers = Object.fromEntries(GUARDIAN_SURVEY_QUESTIONS.map((question) => {
    const rawCounts = candidate.answers?.[question.id]
    const counts = Object.fromEntries(question.options.map((option) => {
      const value = rawCounts?.[option.id]
      return [option.id, Number.isFinite(value) ? Math.max(0, Number(value)) : 0]
    }))
    return [question.id, counts]
  }))
  const submissions = Number.isFinite(candidate.submissions)
    ? Math.max(0, Number(candidate.submissions))
    : 0
  return {
    submissions,
    qualifiedSubmissions: Number.isFinite(candidate.qualifiedSubmissions)
      ? Math.min(submissions, Math.max(0, Number(candidate.qualifiedSubmissions)))
      : 0,
    visitors: Array.isArray(candidate.visitors)
      ? candidate.visitors.filter((item): item is string => typeof item === 'string').slice(0, 5_000)
      : [],
    answers,
  }
}

function normalizeDay(value: unknown): DailyAnalytics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyDay()
  const candidate = value as Partial<DailyAnalytics>
  return {
    pageViews: Number.isFinite(candidate.pageViews) ? Number(candidate.pageViews) : 0,
    visitors: Array.isArray(candidate.visitors)
      ? candidate.visitors.filter((item): item is string => typeof item === 'string')
      : [],
    returningVisitors: Array.isArray(candidate.returningVisitors)
      ? candidate.returningVisitors.filter((item): item is string => typeof item === 'string')
      : [],
    visitorPageViews: numberRecord(candidate.visitorPageViews),
    paths: numberRecord(candidate.paths),
    pathVisitors: visitorRecord(candidate.pathVisitors),
    engagement: engagementRecord(candidate.engagement),
    vitals: webVitalRecord(candidate.vitals),
    sources: numberRecord(candidate.sources),
    visitorSources: visitorSourceRecord(candidate.visitorSources),
    landingPaths: numberRecord(candidate.landingPaths),
    conversions: conversionRecord(candidate.conversions),
    conversionCountsByVisitor: numberRecord(candidate.conversionCountsByVisitor),
    guardianSurvey: guardianSurveyRecord(candidate.guardianSurvey),
  }
}

function normalizeStore(value: unknown): AnalyticsStore {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyStore()
  const candidate = value as {
    version?: unknown
    visitorIdentity?: Partial<AnalyticsStore['visitorIdentity']>
    days?: unknown
  }
  if (!candidate.days || typeof candidate.days !== 'object' || Array.isArray(candidate.days)) {
    return emptyStore()
  }

  const now = new Date()
  const hasHistoricalDays = Object.keys(candidate.days).length > 0
  const hasMonthlyIdentity = candidate.version === 5
    && candidate.visitorIdentity?.scope === 'calendar-month'
    && typeof candidate.visitorIdentity.startedAt === 'string'
    && typeof candidate.visitorIdentity.reliableFromDay === 'string'
  const visitorIdentity = hasMonthlyIdentity
    ? candidate.visitorIdentity as AnalyticsStore['visitorIdentity']
    : {
        scope: 'calendar-month' as const,
        startedAt: now.toISOString(),
        // A legacy day's arrays may contain both old daily hashes and new
        // monthly hashes during a rolling deployment. Start trustworthy
        // cross-day reporting on the next UTC day instead of double-counting.
        reliableFromDay: hasHistoricalDays
          ? nextUtcDay(now)
          : now.toISOString().slice(0, 10),
      }

  return {
    version: 5,
    visitorIdentity,
    days: Object.fromEntries(
      Object.entries(candidate.days).map(([day, analytics]) => [day, normalizeDay(analytics)]),
    ),
  }
}

async function readStore(): Promise<AnalyticsStore> {
  try {
    const store = normalizeStore(JSON.parse(await fs.readFile(analyticsFile, 'utf8')))
    await fs.chmod(analyticsDataDir, 0o700).catch(() => undefined)
    await fs.chmod(analyticsFile, 0o600).catch(() => undefined)
    return store
  } catch {
    return emptyStore()
  }
}

async function writeStore(store: AnalyticsStore) {
  await fs.mkdir(analyticsDataDir, { recursive: true, mode: 0o700 })
  await fs.chmod(analyticsDataDir, 0o700).catch(() => undefined)
  const temporaryFile = `${analyticsFile}.${process.pid}.tmp`
  await fs.writeFile(temporaryFile, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 })
  await fs.rename(temporaryFile, analyticsFile)
}

export async function initializeAnalyticsStore() {
  const task = writeQueue.then(async () => {
    let store: AnalyticsStore
    try {
      const parsed = JSON.parse(await fs.readFile(analyticsFile, 'utf8')) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Analytics store must be a JSON object')
      }
      const days = (parsed as { days?: unknown }).days
      if (!days || typeof days !== 'object' || Array.isArray(days)) {
        throw new Error('Analytics store is missing its days object')
      }
      store = normalizeStore(parsed)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      store = emptyStore()
    }

    // Production calls this before accepting traffic. Persisting the schema
    // boundary here makes the month-level measurement deterministic without
    // generating a synthetic page view. Malformed files fail startup instead
    // of being replaced, and writeStore keeps the update atomic.
    await writeStore(store)
    return store.visitorIdentity
  })

  writeQueue = task.catch(() => undefined)
  return task
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

export function createVisitorHash(input: string, scopeKey: string) {
  const salt =
    process.env.ANALYTICS_HASH_SALT ||
    process.env.ADMIN_SESSION_SECRET ||
    'ai-knowledgepoints-local-development-only'
  return crypto.createHmac('sha256', salt).update(`${scopeKey}:${input}`).digest('hex').slice(0, 24)
}

export function normalizeConversionEventName(value: unknown): ConversionEventName | null {
  const name = String(value || '').trim().toLowerCase()
  return CONVERSION_EVENT_NAMES.includes(name as ConversionEventName)
    ? name as ConversionEventName
    : null
}

export function normalizeConversionTarget(eventName: ConversionEventName, value: unknown) {
  const target = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  const allowedTargets: Record<ConversionEventName, RegExp> = {
    explore_articles: /^(?:home-hero|home-latest|footer|header|blog-(?:path|filter)-(?:all|principles|practice|insight))$/,
    view_portfolio: /^(?:home-hero|home-books|footer|blog-proof)$/,
    view_book: /^(?:home-)?book-[1-9][0-9]{0,2}$/,
    visit_project: /^project-[1-9][0-9]{0,2}$/,
    visit_github: /^(?:project-[1-9][0-9]{0,2}|footer-profile|about-profile)$/,
    view_planet: /^(?:footer|content-banner|tool-[0-9]{6,20})$/,
    join_planet: /^(?:planet-hero|planet-footer|content-banner)$/,
    ai_native_generation_interest: /^(?:course-hero|course-preview|course-bottom|planet-pilot|self-check-result)$/,
    course_beta_guardian_interest: /^(?:course-bottom|guardian-intake-wechat|l12-complete)$/,
    ai_literacy_check_complete: /^(?:boundary|developing|ready)$/,
    course_preview_play: /^(?:l0[1-9]|l1[0-2])$/,
    open_tool: /^(?:tool-[0-9]{6,20}|plugin-[a-z0-9._-]{1,40})$/,
    subscribe_feed: /^(?:footer|article-card)$/,
    follow_wechat: /^(?:footer-qr|about-card|article-card)$/,
  }
  return allowedTargets[eventName].test(target) ? target : null
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
    const visitorPageViews = daily.visitorPageViews[visitorHash] || 0

    if (visitorPageViews >= 100) {
      return {
        views: getPathViewsFromStore(store, normalizedPath),
        visitors: getPathVisitorsFromStore(store, normalizedPath),
      }
    }

    // PV counts a real browser session entering the path. The anonymous hash is
    // stable only inside one calendar month: enough for monthly de-duplication,
    // but it cannot link readers across month boundaries and stores no raw IP.
    daily.pageViews += 1
    daily.visitorPageViews[visitorHash] = visitorPageViews + 1
    daily.paths[normalizedPath] = (daily.paths[normalizedPath] || 0) + 1

    if (!pathVisitors.includes(visitorHash)) {
      pathVisitors.push(visitorHash)
      daily.pathVisitors[normalizedPath] = pathVisitors
    }

    if (isNewVisitor) {
      daily.visitors.push(visitorHash)
      daily.sources[source] = (daily.sources[source] || 0) + 1
      daily.visitorSources[visitorHash] = source
      daily.landingPaths[normalizedPath] = (daily.landingPaths[normalizedPath] || 0) + 1
    }
    if (context.returningReader && !daily.returningVisitors.includes(visitorHash)) {
      daily.returningVisitors.push(visitorHash)
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

export async function recordEngagement(
  pathname: string,
  visitorHash: string,
  signal: EngagementSignal,
) {
  const normalizedPath = normalizeAnalyticsPath(pathname)
  if (!normalizedPath) throw new Error('Invalid analytics path')

  const task = writeQueue.then(async () => {
    const store = await readStore()
    const day = new Date().toISOString().slice(0, 10)
    const daily = store.days[day] || emptyDay()
    if (!daily.visitors.includes(visitorHash)) return
    if (!daily.pathVisitors[normalizedPath]?.includes(visitorHash)) return
    const pathSignals = daily.engagement[normalizedPath] || {}
    const previous = pathSignals[visitorHash] || { seconds: 0, depth: 0 }
    pathSignals[visitorHash] = {
      seconds: Math.min(3600, Math.max(previous.seconds, Math.round(signal.seconds || 0))),
      depth: Math.min(100, Math.max(previous.depth, Math.round(signal.depth || 0))),
    }
    daily.engagement[normalizedPath] = pathSignals
    store.days[day] = daily
    await writeStore(store)
  })

  writeQueue = task.catch(() => undefined)
  return task
}

export async function recordConversion(
  pathname: string,
  visitorHash: string,
  rawName: unknown,
  rawTarget: unknown,
) {
  const normalizedPath = normalizeAnalyticsPath(pathname)
  const name = normalizeConversionEventName(rawName)
  if (!normalizedPath || !name) throw new Error('Invalid conversion event')
  const target = normalizeConversionTarget(name, rawTarget)
  if (!target) throw new Error('Invalid conversion target')

  const task = writeQueue.then(async () => {
    const store = await readStore()
    const day = new Date().toISOString().slice(0, 10)
    const daily = store.days[day] || emptyDay()
    if (!daily.visitors.includes(visitorHash)
      || !daily.pathVisitors[normalizedPath]?.includes(visitorHash)) {
      return { recorded: false, reason: 'missing-page-view' as const }
    }
    const visitorCount = daily.conversionCountsByVisitor[visitorHash] || 0
    const totalEvents = Object.values(daily.conversions)
      .reduce((total, event) => total + event.count, 0)

    // Bound both per-browser activity and the whole private file. Event names
    // and targets are normalized above, so callers cannot create arbitrary keys.
    if (visitorCount >= 30 || totalEvents >= 50_000) {
      return { recorded: false, reason: 'rate-limit' as const }
    }

    const conversion = daily.conversions[name] || {
      count: 0,
      visitors: [],
      paths: {},
      targets: {},
    }
    conversion.count += 1
    if (!conversion.visitors.includes(visitorHash) && conversion.visitors.length < 50_000) {
      conversion.visitors.push(visitorHash)
    }
    conversion.paths[normalizedPath] = (conversion.paths[normalizedPath] || 0) + 1
    conversion.targets[target] = (conversion.targets[target] || 0) + 1
    daily.conversionCountsByVisitor[visitorHash] = visitorCount + 1
    daily.conversions[name] = conversion
    store.days[day] = daily
    await writeStore(store)
    return { recorded: true }
  })

  writeQueue = task.catch(() => undefined)
  return task
}

export async function recordGuardianSurvey(
  pathname: string,
  visitorHash: string,
  rawAnswers: unknown,
) {
  const normalizedPath = normalizeAnalyticsPath(pathname)
  const answers = normalizeGuardianSurveyAnswers(rawAnswers)
  if (normalizedPath !== '/ai-native-generation' || !answers) {
    throw new Error('Invalid guardian survey')
  }

  const task = writeQueue.then(async () => {
    const store = await readStore()
    const day = new Date().toISOString().slice(0, 10)
    const month = day.slice(0, 7)
    const daily = store.days[day] || emptyDay()
    if (!daily.visitors.includes(visitorHash)
      || !daily.pathVisitors[normalizedPath]?.includes(visitorHash)) {
      return { recorded: false, reason: 'missing-page-view' as const }
    }

    const alreadySubmitted = Object.entries(store.days).some(([storedDay, analytics]) =>
      storedDay.startsWith(month) && analytics.guardianSurvey.visitors.includes(visitorHash))
    if (alreadySubmitted) {
      return { recorded: false, reason: 'already-submitted-this-month' as const }
    }
    const monthSubmissions = Object.entries(store.days)
      .filter(([storedDay]) => storedDay.startsWith(month))
      .reduce((total, [, analytics]) => total + analytics.guardianSurvey.submissions, 0)
    if (monthSubmissions >= 5_000) {
      return { recorded: false, reason: 'rate-limit' as const }
    }

    const survey = daily.guardianSurvey
    survey.submissions += 1
    if (isQualifiedGuardianSurvey(answers)) survey.qualifiedSubmissions += 1
    survey.visitors.push(visitorHash)
    for (const question of GUARDIAN_SURVEY_QUESTIONS) {
      const optionId = answers[question.id]
      const counts = survey.answers[question.id] || {}
      counts[optionId] = (counts[optionId] || 0) + 1
      survey.answers[question.id] = counts
    }
    daily.guardianSurvey = survey
    store.days[day] = daily
    await writeStore(store)
    return {
      recorded: true,
      qualified: isQualifiedGuardianSurvey(answers),
    }
  })

  writeQueue = task.catch(() => undefined)
  return task
}

export async function recordWebVital(
  pathname: string,
  visitorHash: string,
  rawName: unknown,
  rawValue: unknown,
) {
  const normalizedPath = normalizeAnalyticsPath(pathname)
  const name = normalizeCoreWebVitalName(rawName)
  if (!normalizedPath || !name) throw new Error('Invalid web vital')
  const value = normalizeCoreWebVitalValue(name, rawValue)
  if (value === null) throw new Error('Invalid web vital value')

  const task = writeQueue.then(async () => {
    const store = await readStore()
    const day = new Date().toISOString().slice(0, 10)
    const daily = store.days[day] || emptyDay()
    const pathVitals = daily.vitals[normalizedPath] || {}
    const signals = pathVitals[name] || {}
    const totalSignals = Object.values(daily.vitals).reduce(
      (total, metrics) => total + CORE_WEB_VITAL_NAMES.reduce(
        (metricTotal, metricName) => metricTotal + Object.keys(metrics[metricName] || {}).length,
        0,
      ),
      0,
    )

    // Keep the private file bounded even if an endpoint is deliberately hit
    // with many synthetic visitor hashes. Normal traffic is far below this.
    if (!(visitorHash in signals) && (Object.keys(signals).length >= 5_000 || totalSignals >= 50_000)) return
    signals[visitorHash] = Math.max(signals[visitorHash] || 0, value)
    pathVitals[name] = signals
    daily.vitals[normalizedPath] = pathVitals
    store.days[day] = daily
    await writeStore(store)
  })

  writeQueue = task.catch(() => undefined)
  return task
}

export function coreWebVitalRating(
  name: CoreWebVitalName,
  value: number,
): CoreWebVitalRating {
  const thresholds = {
    LCP: { good: 2_500, poor: 4_000 },
    INP: { good: 200, poor: 500 },
    CLS: { good: 0.1, poor: 0.25 },
  }[name]
  if (value <= thresholds.good) return 'good'
  return value > thresholds.poor ? 'poor' : 'needs-improvement'
}

function percentile75(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)]
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
  const dailyEngagedVisitors = (day: DailyAnalytics | undefined) => new Set(
    Object.values(day?.engagement || {}).flatMap((signals) => Object.keys(signals)),
  ).size
  const returningDailyVisitors = selectedDays.reduce(
    (total, day) => total + (store.days[day]?.returningVisitors.length || 0),
    0,
  )
  const engagedDailyVisitors = selectedDays.reduce(
    (total, day) => total + dailyEngagedVisitors(store.days[day]),
    0,
  )
  const pathTotals: Record<string, {
    views: number
    visitors: number
    engagedVisitors: number
    depth50Visitors: number
    depth90Visitors: number
    engagedSeconds: number
  }> = {}
  const sourceTotals: Record<string, number> = {}
  const campaignFunnelTotals: Record<string, {
    visitors: number
    coursePageVisitors: number
    courseInterestVisitors: number
    coursePreviewVisitors: number
    planetJoinVisitors: number
    guardianInterestVisitors: number
  }> = {}
  const guardianSurveyTotals: DailyGuardianSurvey = {
    submissions: 0,
    qualifiedSubmissions: 0,
    visitors: [],
    answers: Object.fromEntries(
      GUARDIAN_SURVEY_QUESTIONS.map((question) => [question.id, {}]),
    ),
  }
  const landingTotals: Record<string, number> = {}
  const webVitalValues = Object.fromEntries(
    CORE_WEB_VITAL_NAMES.map((name) => [name, [] as number[]]),
  ) as Record<CoreWebVitalName, number[]>
  const conversionTotals: Record<string, DailyConversionEvent> = {}
  let conversionVisitors = 0

  for (const day of selectedDays) {
    const daily = store.days[day]
    if (!daily) continue
    for (const [pathname, views] of Object.entries(daily.paths)) {
      pathTotals[pathname] ||= {
        views: 0,
        visitors: 0,
        engagedVisitors: 0,
        depth50Visitors: 0,
        depth90Visitors: 0,
        engagedSeconds: 0,
      }
      pathTotals[pathname].views += views
      pathTotals[pathname].visitors += daily.pathVisitors[pathname]?.length || 0
    }
    for (const [pathname, signals] of Object.entries(daily.engagement)) {
      pathTotals[pathname] ||= {
        views: 0,
        visitors: 0,
        engagedVisitors: 0,
        depth50Visitors: 0,
        depth90Visitors: 0,
        engagedSeconds: 0,
      }
      const values = Object.values(signals)
      pathTotals[pathname].engagedVisitors += values.filter((signal) => signal.seconds >= 10 || signal.depth >= 25).length
      pathTotals[pathname].depth50Visitors += values.filter((signal) => signal.depth >= 50).length
      pathTotals[pathname].depth90Visitors += values.filter((signal) => signal.depth >= 90).length
      pathTotals[pathname].engagedSeconds += values.reduce((total, signal) => total + signal.seconds, 0)
    }
    for (const [source, visitors] of Object.entries(daily.sources)) {
      sourceTotals[source] = (sourceTotals[source] || 0) + visitors
    }
    const funnelFor = (source: string) => {
      campaignFunnelTotals[source] ||= {
        visitors: 0,
        coursePageVisitors: 0,
        courseInterestVisitors: 0,
        coursePreviewVisitors: 0,
        planetJoinVisitors: 0,
        guardianInterestVisitors: 0,
      }
      return campaignFunnelTotals[source]
    }
    for (const source of Object.values(daily.visitorSources)) {
      funnelFor(source).visitors += 1
    }
    const addStageVisitors = (
      visitors: string[] | undefined,
      field: 'coursePageVisitors' | 'courseInterestVisitors' | 'coursePreviewVisitors' | 'planetJoinVisitors' | 'guardianInterestVisitors',
    ) => {
      for (const visitor of visitors || []) {
        const source = daily.visitorSources[visitor]
        if (source) funnelFor(source)[field] += 1
      }
    }
    addStageVisitors(daily.pathVisitors['/ai-native-generation'], 'coursePageVisitors')
    addStageVisitors(daily.conversions.ai_native_generation_interest?.visitors, 'courseInterestVisitors')
    addStageVisitors(daily.conversions.course_preview_play?.visitors, 'coursePreviewVisitors')
    addStageVisitors(daily.conversions.join_planet?.visitors, 'planetJoinVisitors')
    addStageVisitors(daily.conversions.course_beta_guardian_interest?.visitors, 'guardianInterestVisitors')
    guardianSurveyTotals.submissions += daily.guardianSurvey.submissions
    guardianSurveyTotals.qualifiedSubmissions += daily.guardianSurvey.qualifiedSubmissions
    for (const question of GUARDIAN_SURVEY_QUESTIONS) {
      const totals = guardianSurveyTotals.answers[question.id]
      for (const option of question.options) {
        totals[option.id] = (totals[option.id] || 0)
          + (daily.guardianSurvey.answers[question.id]?.[option.id] || 0)
      }
    }
    for (const [pathname, visitors] of Object.entries(daily.landingPaths)) {
      landingTotals[pathname] = (landingTotals[pathname] || 0) + visitors
    }
    for (const metrics of Object.values(daily.vitals)) {
      for (const name of CORE_WEB_VITAL_NAMES) {
        webVitalValues[name].push(...Object.values(metrics[name] || {}))
      }
    }
    const dailyConversionVisitors = new Set<string>()
    for (const [rawName, event] of Object.entries(daily.conversions)) {
      const name = normalizeConversionEventName(rawName)
      if (!name) continue
      const total = conversionTotals[name] || { count: 0, visitors: [], paths: {}, targets: {} }
      total.count += event.count
      for (const visitor of event.visitors) dailyConversionVisitors.add(visitor)
      for (const [pathname, count] of Object.entries(event.paths)) {
        total.paths[pathname] = (total.paths[pathname] || 0) + count
      }
      for (const [target, count] of Object.entries(event.targets)) {
        total.targets[target] = (total.targets[target] || 0) + count
      }
      // Daily hashes cannot be de-duplicated across days, matching the visitor
      // denominator. Prefixing the day keeps the same hash on separate days distinct.
      total.visitors.push(...event.visitors.map((visitor) => `${day}:${visitor}`))
      conversionTotals[name] = total
    }
    conversionVisitors += dailyConversionVisitors.size
  }

  const topPaths = Object.entries(pathTotals)
    .sort(([, left], [, right]) => right.views - left.views)
    .slice(0, 10)
    .map(([pathname, metrics]) => ({
      pathname,
      views: metrics.views,
      visitors: metrics.visitors,
      engagedVisitors: metrics.engagedVisitors,
      depth50Visitors: metrics.depth50Visitors,
      depth90Visitors: metrics.depth90Visitors,
      averageEngagedSeconds: metrics.engagedVisitors
        ? Math.round(metrics.engagedSeconds / metrics.engagedVisitors)
        : 0,
    }))
  const topSources = Object.entries(sourceTotals)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 10)
    .map(([source, visitors]) => ({ source, visitors }))
  const campaignFunnels = Object.entries(campaignFunnelTotals)
    .sort(([, left], [, right]) => right.visitors - left.visitors)
    .slice(0, 12)
    .map(([source, metrics]) => {
      const rate = (value: number) => metrics.visitors
        ? Math.min(100, Math.round((value / metrics.visitors) * 1000) / 10)
        : 0
      return {
        source,
        ...metrics,
        coursePageRate: rate(metrics.coursePageVisitors),
        coursePreviewRate: rate(metrics.coursePreviewVisitors),
        planetJoinRate: rate(metrics.planetJoinVisitors),
        guardianInterestRate: rate(metrics.guardianInterestVisitors),
      }
    })
  const guardianSurvey = {
    target: GUARDIAN_SURVEY_TARGET,
    submissions: guardianSurveyTotals.submissions,
    qualifiedSubmissions: guardianSurveyTotals.qualifiedSubmissions,
    progressRate: Math.min(
      100,
      Math.round((guardianSurveyTotals.qualifiedSubmissions / GUARDIAN_SURVEY_TARGET) * 1000) / 10,
    ),
    questions: GUARDIAN_SURVEY_QUESTIONS.map((question) => ({
      id: question.id,
      label: question.label,
      options: question.options.map((option) => ({
        id: option.id,
        label: option.label,
        count: guardianSurveyTotals.answers[question.id]?.[option.id] || 0,
      })),
    })),
  }
  const topLandingPaths = Object.entries(landingTotals)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 10)
    .map(([pathname, visitors]) => ({ pathname, visitors }))
  const timeline = [...selectedDays].reverse().map((date) => ({
    date,
    pageViews: store.days[date]?.pageViews || 0,
    visitors: store.days[date]?.visitors.length || 0,
  }))
  const webVitals = CORE_WEB_VITAL_NAMES.map((name) => {
    const p75 = percentile75(webVitalValues[name])
    return {
      name,
      p75,
      samples: webVitalValues[name].length,
      rating: p75 === null ? 'insufficient-data' as const : coreWebVitalRating(name, p75),
    }
  })
  const topConversions = Object.entries(conversionTotals)
    .flatMap(([rawName, event]) => {
      const name = normalizeConversionEventName(rawName)
      return name ? [{
        name,
        count: event.count,
        visitors: new Set(event.visitors).size,
        paths: Object.entries(event.paths)
          .sort(([, left], [, right]) => right - left)
          .slice(0, 5)
          .map(([pathname, count]) => ({ pathname, count })),
        targets: Object.entries(event.targets)
          .sort(([, left], [, right]) => right - left)
          .slice(0, 5)
          .map(([target, count]) => ({ target, count })),
      }] : []
    })
    .sort((left, right) => right.visitors - left.visitors || right.count - left.count)

  return {
    days: safeDays,
    pageViews,
    dailyVisitors,
    previousPageViews,
    previousDailyVisitors,
    pageViewChange: percentageChange(pageViews, previousPageViews),
    visitorChange: percentageChange(dailyVisitors, previousDailyVisitors),
    returningDailyVisitors,
    engagedDailyVisitors,
    returningRate: dailyVisitors
      ? Math.min(100, Math.round((returningDailyVisitors / dailyVisitors) * 1000) / 10)
      : 0,
    engagementRate: dailyVisitors
      ? Math.min(100, Math.round((engagedDailyVisitors / dailyVisitors) * 1000) / 10)
      : 0,
    conversionVisitors,
    conversionRate: dailyVisitors
      ? Math.min(100, Math.round((conversionVisitors / dailyVisitors) * 1000) / 10)
      : 0,
    topConversions,
    webVitals,
    topPaths,
    topSources,
    campaignFunnels,
    guardianSurvey,
    topLandingPaths,
    timeline,
  }
}

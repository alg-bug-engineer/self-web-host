import { NextRequest, NextResponse } from 'next/server'
import {
  createVisitorHash,
  getPathViews,
  normalizeConversionEventName,
  normalizeConversionTarget,
  normalizeCoreWebVitalName,
  recordConversion,
  recordEngagement,
  recordPageView,
  recordWebVital,
} from '@/lib/analytics-storage'
import { normalizeTrackableAnalyticsPath } from '@/lib/trackable-analytics-path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = { 'Cache-Control': 'no-store' }

function safeCampaignToken(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function trafficSource(body: Record<string, unknown>) {
  const campaign = safeCampaignToken(body.utmSource)
  const medium = safeCampaignToken(body.utmMedium)
  if (campaign) return `campaign:${campaign}${medium ? `/${medium}` : ''}`

  const rawReferrer = String(body.referrer || '').slice(0, 500)
  if (!rawReferrer) return 'direct'

  try {
    const hostname = new URL(rawReferrer).hostname.toLowerCase().replace(/^www\./, '')
    if (!hostname) return 'direct'
    if (hostname === 'ai-knowledgepoints.cn' || hostname.endsWith('.ai-knowledgepoints.cn')) {
      return 'internal'
    }

    const searchEngines: Array<[RegExp, string]> = [
      [/(^|\.)google\./, 'google'],
      [/(^|\.)baidu\.com$/, 'baidu'],
      [/(^|\.)bing\.com$/, 'bing'],
      [/(^|\.)sogou\.com$/, 'sogou'],
      [/(^|\.)so\.com$/, '360'],
    ]
    const searchEngine = searchEngines.find(([pattern]) => pattern.test(hostname))
    if (searchEngine) return `search:${searchEngine[1]}`

    const socialSources: Array<[RegExp, string]> = [
      [/(^|\.)weixin\.qq\.com$|^mp\.weixin\.qq\.com$/, 'wechat'],
      [/(^|\.)zhihu\.com$/, 'zhihu'],
      [/(^|\.)weibo\.com$/, 'weibo'],
      [/(^|\.)juejin\.cn$/, 'juejin'],
      [/(^|\.)csdn\.net$/, 'csdn'],
      [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'x'],
    ]
    const socialSource = socialSources.find(([pattern]) => pattern.test(hostname))
    if (socialSource) return `social:${socialSource[1]}`

    return `referral:${hostname.slice(0, 80)}`
  } catch {
    return 'direct'
  }
}

function requestVisitorHash(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const visitorInput = [
    forwardedFor || request.headers.get('x-real-ip') || 'unknown',
    request.headers.get('user-agent') || 'unknown',
    request.headers.get('accept-language') || 'unknown',
  ].join('|')
  // Keep the anonymous fingerprint stable only inside the current calendar
  // month. This supports a month-level UV estimate without storing a raw IP or
  // creating an identity that can be linked across months.
  return createVisitorHash(visitorInput, new Date().toISOString().slice(0, 7))
}

function shouldIgnoreRequest(request: NextRequest) {
  if (request.headers.get('dnt') === '1') return true
  const userAgent = request.headers.get('user-agent') || ''
  return /bot\b|crawler|spider|slurp|headless|lighthouse|pagespeed|preview|monitoring/i.test(userAgent)
}

export async function GET(request: NextRequest) {
  const pathname = normalizeTrackableAnalyticsPath(request.nextUrl.searchParams.get('path') || '')
  if (!pathname) {
    return NextResponse.json({ ok: false, message: '无效路径' }, { status: 400 })
  }

  return NextResponse.json(
    { ok: true, path: pathname, views: await getPathViews(pathname) },
    { headers: noStoreHeaders },
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const pathname = normalizeTrackableAnalyticsPath(String(body.path || ''))
  if (!pathname) {
    return NextResponse.json({ ok: false, message: '无效路径' }, { status: 400 })
  }
  if (shouldIgnoreRequest(request)) {
    return NextResponse.json({ ok: true, ignored: true }, { headers: noStoreHeaders })
  }

  if (body.kind === 'conversion') {
    const name = normalizeConversionEventName(body.name)
    if (!name) {
      return NextResponse.json({ ok: false, message: '无效转化事件' }, { status: 400 })
    }
    const target = normalizeConversionTarget(name, body.target)
    if (!target) {
      return NextResponse.json({ ok: false, message: '无效转化目标' }, { status: 400 })
    }
    await recordConversion(pathname, requestVisitorHash(request), name, target)
    return NextResponse.json({ ok: true, name }, { headers: noStoreHeaders })
  }

  const result = await recordPageView(pathname, requestVisitorHash(request), {
    source: trafficSource(body),
    returningReader: body.returningReader === true,
  })

  return NextResponse.json(
    { ok: true, path: pathname, views: result.views, visitors: result.visitors },
    { headers: noStoreHeaders },
  )
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const pathname = normalizeTrackableAnalyticsPath(String(body.path || ''))
  if (!pathname) {
    return NextResponse.json({ ok: false, message: '无效路径' }, { status: 400 })
  }
  if (shouldIgnoreRequest(request)) {
    return NextResponse.json({ ok: true, ignored: true }, { headers: noStoreHeaders })
  }

  const seconds = Math.min(3600, Math.max(0, Number(body.seconds) || 0))
  const depth = Math.min(100, Math.max(0, Number(body.depth) || 0))
  if (seconds < 10 && depth < 25) {
    return NextResponse.json({ ok: false, message: '互动信号不足' }, { status: 400 })
  }

  await recordEngagement(pathname, requestVisitorHash(request), { seconds, depth })
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders })
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const pathname = normalizeTrackableAnalyticsPath(String(body.path || ''))
  const name = normalizeCoreWebVitalName(body.name)
  const value = Number(body.value)
  if (!pathname || !name || !Number.isFinite(value) || value < 0) {
    return NextResponse.json({ ok: false, message: '无效性能指标' }, { status: 400 })
  }
  if (shouldIgnoreRequest(request)) {
    return NextResponse.json({ ok: true, ignored: true }, { headers: noStoreHeaders })
  }

  await recordWebVital(pathname, requestVisitorHash(request), name, value)
  return NextResponse.json({ ok: true }, { headers: noStoreHeaders })
}

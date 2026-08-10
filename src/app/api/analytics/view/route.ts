import { NextRequest, NextResponse } from 'next/server'
import {
  createVisitorHash,
  getPathViews,
  normalizeAnalyticsPath,
  recordPageView,
} from '@/lib/analytics-storage'

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

export async function GET(request: NextRequest) {
  const pathname = normalizeAnalyticsPath(request.nextUrl.searchParams.get('path') || '')
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
  const pathname = normalizeAnalyticsPath(String(body.path || ''))
  if (!pathname) {
    return NextResponse.json({ ok: false, message: '无效路径' }, { status: 400 })
  }

  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const visitorInput = [
    forwardedFor || request.headers.get('x-real-ip') || 'unknown',
    request.headers.get('user-agent') || 'unknown',
    request.headers.get('accept-language') || 'unknown',
  ].join('|')
  const day = new Date().toISOString().slice(0, 10)
  const result = await recordPageView(pathname, createVisitorHash(visitorInput, day), {
    source: trafficSource(body),
  })

  return NextResponse.json(
    { ok: true, path: pathname, views: result.views, visitors: result.visitors },
    { headers: noStoreHeaders },
  )
}

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
  const views = await recordPageView(pathname, createVisitorHash(visitorInput, day))

  return NextResponse.json(
    { ok: true, path: pathname, views },
    { headers: noStoreHeaders },
  )
}

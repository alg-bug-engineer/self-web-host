import { allPosts } from 'contentlayer/generated'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'ai-knowledgepoints',
      commit: process.env.APP_COMMIT_SHA || 'unknown',
      uptimeSeconds: Math.round(process.uptime()),
      publishedPosts: allPosts.filter((post) => post.published).length,
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

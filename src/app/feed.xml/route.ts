import { allPosts } from 'contentlayer/generated'
import { BRAND_NAME, SITE_DESCRIPTION } from '@/lib/site'
import { renderRss } from '@/lib/rss'

export const dynamic = 'force-static'

export async function GET() {
  return renderRss(allPosts, {
    title: `${BRAND_NAME} · AI 知识点`,
    description: SITE_DESCRIPTION,
    path: '/',
    feedPath: '/feed.xml',
  })
}

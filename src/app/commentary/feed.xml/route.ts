import { allPosts } from 'contentlayer/generated'
import { BRAND_NAME } from '@/lib/site'
import { getPublishedCommentary } from '@/lib/commentary.mjs'
import { renderRss } from '@/lib/rss'

export const dynamic = 'force-static'

export async function GET() {
  return renderRss(getPublishedCommentary(allPosts), {
    title: `AI锐评 | ${BRAND_NAME}`,
    description: 'AI 热门事件、产品与行业变化：有出处的事实，有理由的判断。',
    path: '/commentary',
    feedPath: '/commentary/feed.xml',
  })
}

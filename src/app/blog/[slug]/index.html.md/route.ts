import { allPosts } from 'contentlayer/generated'
import { SITE_URL, absoluteUrl } from '@/lib/site'
import { renderPostMarkdown } from '@/lib/llms-markdown.mjs'

export const dynamic = 'force-static'

type RouteContext = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return allPosts.filter((post) => post.published).map((post) => ({ slug: post.slug }))
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug } = await params
  const post = allPosts.find((item) => item.slug === slug && item.published)
  if (!post) {
    return new Response('文章不存在。\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const canonical = absoluteUrl(post.url)
  return new Response(renderPostMarkdown(post, SITE_URL), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      Link: `<${canonical}>; rel="canonical"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

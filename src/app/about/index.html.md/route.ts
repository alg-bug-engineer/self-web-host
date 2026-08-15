import portfolioData from 'content/collections/portfolio.json'
import profileData from '@/data/profile.json'
import { renderAboutMarkdown } from '@/lib/identity-markdown.mjs'
import { AUTHOR_PROFILES, BRAND_NAME, SITE_URL } from '@/lib/site'

export const dynamic = 'force-static'

export async function GET() {
  const canonical = `${SITE_URL}/about`
  const markdownUrl = `${canonical}/index.html.md`
  const body = renderAboutMarkdown(profileData, portfolioData, {
    brandName: BRAND_NAME,
    canonical,
    markdownUrl,
    profileUrls: AUTHOR_PROFILES,
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      Link: `<${canonical}>; rel="canonical"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

import portfolioData from 'content/collections/portfolio.json'
import { renderPortfolioMarkdown } from '@/lib/identity-markdown.mjs'
import { BRAND_NAME, SITE_URL } from '@/lib/site'

export const dynamic = 'force-static'

export async function GET() {
  const canonical = `${SITE_URL}/portfolio`
  const markdownUrl = `${canonical}/index.html.md`
  const body = renderPortfolioMarkdown(portfolioData, {
    brandName: BRAND_NAME,
    canonical,
    markdownUrl,
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

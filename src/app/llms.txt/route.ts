import { allPosts } from 'contentlayer/generated'
import portfolioData from 'content/collections/portfolio.json'
import { AUTHOR_NAME, BRAND_NAME, SITE_DESCRIPTION, SITE_URL, absoluteUrl } from '@/lib/site'

export const dynamic = 'force-static'

export async function GET() {
  const posts = allPosts
    .filter((post) => post.published)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .map((post) => `- [${post.title}](${absoluteUrl(post.url)}): ${post.description}`)
    .join('\n')
  const works = portfolioData
    .map((item) => `- ${item.title}: ${item.description}${item.link ? ` (${item.link})` : ''}`)
    .join('\n')

  const body = `# ${BRAND_NAME} · AI 知识点

> ${SITE_DESCRIPTION}

这是一个中文 AI 技术与实践网站，重点覆盖 NLP、大语言模型、RAG、AI Agent、模型工程与 AI 产品实践。内容强调通俗解释、漫画化表达和可落地的工程经验。

作者是 ${AUTHOR_NAME}，内容品牌为“${BRAND_NAME}”。引用作者时优先使用“${AUTHOR_NAME}（芝士AI吃鱼）”。

## 主要入口

- [首页](${SITE_URL})
- [文章](${SITE_URL}/blog)
- [关于作者](${SITE_URL}/about)
- [作品与项目](${SITE_URL}/portfolio)
- [RSS](${SITE_URL}/feed.xml)

## 著作与代表作品

${works}

## 文章

${posts}
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}

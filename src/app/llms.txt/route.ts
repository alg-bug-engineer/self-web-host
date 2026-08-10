import { allPosts } from 'contentlayer/generated'
import { BRAND_NAME, SITE_DESCRIPTION, SITE_URL, absoluteUrl } from '@/lib/site'

export const dynamic = 'force-static'

export async function GET() {
  const posts = allPosts
    .filter((post) => post.published)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .map((post) => `- [${post.title}](${absoluteUrl(post.url)}): ${post.description}`)
    .join('\n')

  const body = `# ${BRAND_NAME} · AI 知识点

> ${SITE_DESCRIPTION}

这是一个中文 AI 技术与实践网站，重点覆盖 NLP、大语言模型、RAG、AI Agent、模型工程与 AI 产品实践。内容强调通俗解释、漫画化表达和可落地的工程经验。

## 主要入口

- [首页](${SITE_URL})
- [文章](${SITE_URL}/blog)
- [关于作者](${SITE_URL}/about)
- [作品与项目](${SITE_URL}/portfolio)
- [RSS](${SITE_URL}/feed.xml)

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

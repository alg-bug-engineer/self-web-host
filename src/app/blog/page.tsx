import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import BlogClient from './BlogClient'
import { Suspense } from 'react'
import portfolioData from 'content/collections/portfolio.json'
import { AUTHOR_NAME, BRAND_NAME, SITE_URL, absoluteUrl } from '@/lib/site'

export const metadata = {
  title: 'AI 深度文章与学习路径',
  description: '张其来的 AI 深度文章与学习路径：从大模型、GPT、RAG 到 Agent 工程，以及 AI 对学习、工作与社会的影响。',
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'AI 深度文章与学习路径 | 芝士AI吃鱼',
    description: '从模型原理、Agent 实践到 AI 与人的长期变化，找到适合自己的阅读入口。',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
}

export default function BlogPage() {
  const posts = allPosts
    .filter((post) => post.published)
    .sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)))
  const bookCount = portfolioData.filter((item) => item.type === 'book').length
  const description = '从模型原理、Agent 实践到 AI 与人的长期变化，按清晰路径阅读芝士AI吃鱼的深度文章。'
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}/blog#collection`,
        url: `${SITE_URL}/blog`,
        name: 'AI 深度文章与学习路径',
        description,
        inLanguage: 'zh-CN',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        author: { '@id': `${SITE_URL}/#person`, name: AUTHOR_NAME, alternateName: BRAND_NAME },
        mainEntity: { '@id': `${SITE_URL}/blog#articles` },
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE_URL}/blog#articles`,
        name: '芝士AI吃鱼文章列表',
        numberOfItems: posts.length,
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        itemListElement: posts.map((post, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: post.title,
          url: absoluteUrl(post.url),
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE_URL}/blog#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '文章', item: `${SITE_URL}/blog` },
        ],
      },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent-primary"></div>
        </div>
      }>
        <BlogClient posts={posts} bookCount={bookCount} />
      </Suspense>
    </>
  )
}

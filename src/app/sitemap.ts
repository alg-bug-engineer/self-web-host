import { allPosts } from 'contentlayer/generated'
import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.ai-knowledgepoints.cn'

  // 文章路由
  const postUrls = allPosts.map((post) => ({
    url: `${baseUrl}${post.url}`,
    lastModified: new Date(post.date),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // 基础路由
  const routes = ['', '/blog', '/collections/tools', '/portfolio', '/planet', '/about', '/search'].map(
    (route) => ({
      url: `${baseUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: route === '' ? 1 : 0.9,
    })
  )

  return [...routes, ...postUrls]
}

import { allPosts } from 'contentlayer/generated'
import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = SITE_URL

  // 文章路由
  const postUrls = allPosts.filter((post) => post.published).map((post) => ({
    url: `${baseUrl}${post.url}`,
    lastModified: new Date(post.date),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // 基础路由
  const latestPostDate = allPosts.reduce(
    (latest, post) => (post.date > latest ? post.date : latest),
    '2026-01-01',
  )

  const routes = ['', '/blog', '/collections/manga', '/collections/tools', '/tools/markdown', '/portfolio', '/planet', '/about', '/lab'].map(
    (route) => ({
      url: `${baseUrl}${route}`,
      lastModified: new Date(latestPostDate),
      changeFrequency: 'daily' as const,
      priority: route === '' ? 1 : 0.9,
    })
  )

  return [...routes, ...postUrls]
}

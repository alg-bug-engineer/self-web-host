import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/api/admin/'], // 保护后台不被爬虫抓取
    },
    sitemap: 'https://www.ai-knowledgepoints.cn/sitemap.xml',
  }
}

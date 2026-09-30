import type { Post } from 'contentlayer/generated'
import { SITE_URL, absoluteUrl } from '@/lib/site'

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function renderRss(posts: Post[], channel: { title: string; description: string; path: string; feedPath: string }) {
  const published = posts.filter((post) => post.published)
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
  const items = published.map((post) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(absoluteUrl(post.url))}</link>
      <guid isPermaLink="true">${escapeXml(absoluteUrl(post.url))}</guid>
      <description>${escapeXml(post.description)}</description>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <dc:creator>${escapeXml(post.author)}</dc:creator>
      ${post.postType === 'commentary' ? '<category>AI锐评</category>' : ''}
      ${(post.tags || []).filter((tag) => tag !== 'AI锐评' || post.postType !== 'commentary').map((tag) => `<category>${escapeXml(tag)}</category>`).join('')}
    </item>`).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.path === '/' ? SITE_URL : absoluteUrl(channel.path))}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date(published[0]?.date || Date.now()).toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(absoluteUrl(channel.feedPath))}" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}

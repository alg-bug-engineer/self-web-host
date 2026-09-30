import Link from 'next/link'
import { allPosts } from 'contentlayer/generated'
import { BRAND_NAME, SITE_URL, absoluteUrl } from '@/lib/site'
import { commentaryTopicLabel, formatCommentaryDate, getPublishedCommentary } from '@/lib/commentary.mjs'

const description = '每天看 AI 热门事件、产品与行业变化。有出处的事实，有理由的判断，也说清楚它为什么让人兴奋、担心，或者根本不值得买单。'

export const metadata = {
  title: 'AI锐评：热门事件、产品与行业观察',
  description,
  alternates: {
    canonical: '/commentary',
    types: { 'application/rss+xml': `${SITE_URL}/commentary/feed.xml` },
  },
  openGraph: {
    title: `AI锐评 | ${BRAND_NAME}`,
    description,
    url: `${SITE_URL}/commentary`,
    type: 'website',
    images: [{ url: absoluteUrl('/og.png'), alt: 'AI锐评：热门事件、产品与行业观察' }],
  },
  twitter: { card: 'summary_large_image', title: 'AI锐评', description, images: [absoluteUrl('/og.png')] },
}

export default function CommentaryPage() {
  const posts = getPublishedCommentary(allPosts)
  const [latest, ...archive] = posts
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}/commentary#collection`,
        url: `${SITE_URL}/commentary`,
        name: 'AI锐评',
        description,
        inLanguage: 'zh-CN',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        author: { '@id': `${SITE_URL}/#person`, name: BRAND_NAME },
        mainEntity: { '@id': `${SITE_URL}/commentary#articles` },
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE_URL}/commentary#articles`,
        numberOfItems: posts.length,
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        itemListElement: posts.map((post, index) => ({
          '@type': 'ListItem', position: index + 1, name: post.title, url: absoluteUrl(post.url),
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'AI锐评', item: `${SITE_URL}/commentary` },
        ],
      },
    ],
  }

  return (
    <div className="commentary-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <header className="commentary-header">
        <p className="eyebrow">热门事件 / 产品观察 / 行业变化</p>
        <h1>AI锐评<span>热闹看完，聊点真话。</span></h1>
        <p className="commentary-intro">新模型又来了，新产品又刷屏了。先别急着欢呼，也别急着唱衰：它到底改变了什么，代价又落在谁身上？</p>
        <div className="commentary-meta">
          <span>按天更新 · 有值得说的话再写</span>
          <Link href="/commentary/feed.xml" data-analytics-event="subscribe_feed" data-analytics-target="commentary">订阅 AI锐评 RSS →</Link>
        </div>
      </header>

      {latest ? (
        <section aria-labelledby="latest-commentary-heading" className="commentary-latest">
          <div className="commentary-side-note">
            <h2 id="latest-commentary-heading">最新一篇</h2>
            <time dateTime={latest.date}>{formatCommentaryDate(latest.date)}</time>
            <span>{commentaryTopicLabel(latest)}</span>
          </div>
          <article className="commentary-feature">
            <p className="commentary-kicker">AI锐评 / {latest.readingTime} 分钟阅读</p>
            <h3><Link href={latest.url}>{latest.title}</Link></h3>
            <p>{latest.description}</p>
            <Link href={latest.url} className="section-link">读这篇锐评 →</Link>
          </article>
        </section>
      ) : (
        <p className="commentary-empty">第一篇锐评正在准备。先去看看<Link href="/blog">已有文章</Link>。</p>
      )}

      {archive.length > 0 && (
        <section className="commentary-archive" aria-labelledby="commentary-archive-heading">
          <h2 id="commentary-archive-heading">往期锐评</h2>
          {archive.map((post) => (
            <article key={post.slug}>
              <p className="commentary-kicker"><time dateTime={post.date}>{formatCommentaryDate(post.date)}</time> · {commentaryTopicLabel(post)} · {post.readingTime} 分钟</p>
              <h3><Link href={post.url}>{post.title}</Link></h3>
              <p>{post.description}</p>
            </article>
          ))}
        </section>
      )}

      <aside className="commentary-editor-note" aria-label="栏目说明">
        <h2>可以有脾气，判断得有来由。</h2>
        <p>这里写观点，也留下出处。产品宣传、已经核实的事实和作者判断，会分开说；没亲自测过的，不装作测过。新证据推翻旧判断，就回来改。</p>
        <Link href="/blog" className="section-link">想看原理与工程？继续读技术长文 →</Link>
      </aside>
    </div>
  )
}

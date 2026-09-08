import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import Link from 'next/link'
import { getTopPaths } from '@/lib/analytics-storage'
import portfolioData from 'content/collections/portfolio.json'

export const metadata = {
  alternates: { canonical: '/' },
}

export const dynamic = 'force-dynamic'

type Book = {
  title: string
  type: string
}

const knowledgeTracks = [
  { title: '大模型基础', description: '从 Transformer、Token 到训练与推理，先把底层概念弄明白。', href: '/blog?tag=AI' },
  { title: 'RAG 与知识工程', description: '拆开检索、向量化与生成，看知识库怎样从演示走到可用。', href: '/blog?tag=RAG' },
  { title: 'Agent 与工作流', description: '不只看 Demo，继续讨论工具接入、系统约束和真实交付。', href: '/blog?tag=AI Agent' },
]

const formatDate = (date: string) => new Date(date).toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export default async function Home() {
  const posts = allPosts
    .filter((post) => post.published)
    .sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)))
  const newest = posts[0]
  const latestPosts = posts.slice(1, 5)
  const books = (portfolioData as Book[]).filter((item) => item.type === 'book')
  const weeklyTopPaths = await getTopPaths({ days: 7, prefix: '/blog/', limit: 4 })
  const rankedPosts = weeklyTopPaths
    .map((item) => posts.find((post) => post.url === item.pathname))
    .filter((post): post is (typeof posts)[number] => Boolean(post))
  const popularPosts = (rankedPosts.length ? rankedPosts : posts.slice(0, 4)).slice(0, 4)

  return (
    <div className="home-page">
      <section className="editorial-hero">
        <div>
          <p className="hero-label">个人 AI 技术笔记</p>
          <h1>把 AI 天书，讲成人话。</h1>
          <p className="hero-intro">
            这里不做概念橱窗。文章负责拆原理，教程负责把工具跑通，再用真实项目检验方法到底有没有用。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/blog" className="primary-cta" data-analytics-event="explore_articles" data-analytics-target="home-hero">
              开始探索 <span aria-hidden="true">→</span>
            </Link>
            <Link href="/planet" className="secondary-cta" data-analytics-event="view_planet" data-analytics-target="home-hero">
              查看 AI 实践路线
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-tertiary">
            <span className="hero-proof"><i />{posts.length} 篇公开文章</span>
            <span className="hero-proof"><i />原理、工程与行业观察</span>
            <span className="hero-proof"><i />持续更新</span>
          </div>
        </div>

        <aside className="home-index" aria-label="建议阅读方向">
          <p className="home-index-label">从一个当前问题开始</p>
          {knowledgeTracks.map((track, index) => (
            <Link key={track.title} href={track.href}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{track.title}</strong>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </aside>
      </section>

      <section className="home-section">
        <div className="home-section-header">
          <div>
            <p className="eyebrow">三个长期主题</p>
            <h2>先建立框架，再追新工具</h2>
          </div>
          <p>热点会变，理解模型、组织知识和设计工作流的能力不会很快过期。</p>
        </div>
        <div className="topic-list">
          {knowledgeTracks.map((track, index) => (
            <Link key={track.title} href={track.href} className="topic-row">
              <span className="topic-row-number">{String(index + 1).padStart(2, '0')}</span>
              <h3>{track.title}</h3>
              <p>{track.description}</p>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-header">
          <div>
            <p className="eyebrow">最近发布</p>
            <h2>新文章</h2>
          </div>
          <Link href="/blog" className="section-link" data-analytics-event="explore_articles" data-analytics-target="home-latest">浏览全部文章 →</Link>
        </div>
        <div className="latest-grid">
          {newest && (
            <Link href={newest.url} className="lead-article">
              <p className="lead-article-meta">{formatDate(newest.date)} · {newest.readingTime} 分钟阅读</p>
              <h3>{newest.title}</h3>
              <p>{newest.description}</p>
              <span className="section-link mt-5">阅读全文 →</span>
            </Link>
          )}
          <div className="article-list">
            {latestPosts.map((post) => (
              <Link key={post._id} href={post.url}>
                <p className="article-list-meta">{post.tags?.[0] || 'AI'} · {formatDate(post.date)}</p>
                <h3>{post.title}</h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-header">
          <div>
            <p className="eyebrow">著作</p>
            <h2>把零散理解写成体系</h2>
          </div>
          <Link href="/portfolio" className="section-link" data-analytics-event="view_portfolio" data-analytics-target="home-books">查看著作与作品 →</Link>
        </div>
        <div className="book-list">
          {books.slice(0, 5).map((book, index) => (
            <article key={book.title} className="book-item">
              <span>{String(index + 1).padStart(2, '0')} / 著作</span>
              <h3>《{book.title}》</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-header">
          <div>
            <p className="eyebrow">本周阅读</p>
            <h2>读者最近在看</h2>
          </div>
          <p>列表来自站内近七天阅读记录；数据不足时按最新文章补齐。</p>
        </div>
        <div className="popular-list">
          {popularPosts.map((post, index) => (
            <Link key={post._id} href={post.url}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{post.title}</strong>
              <i>→</i>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import Link from 'next/link'
import Image from 'next/image'
import { getTopPaths } from '@/lib/analytics-storage'
import portfolioData from 'content/collections/portfolio.json'

export const metadata = {
  alternates: { canonical: '/' },
}

export const dynamic = 'force-dynamic'

type Book = {
  title: string
  type: string
  authors?: string[]
  description?: string
  image?: string
  link?: string
}

const knowledgeTracks = [
  { icon: '模', title: '大模型基础', description: '从 Transformer、Token 到训练与推理，建立不易过时的底层认知。', href: '/blog?tag=AI', tone: 'blue' },
  { icon: '检', title: 'RAG 与知识工程', description: '拆开检索、向量化与生成，让知识库从 Demo 走向真正可用。', href: '/blog?tag=RAG', tone: 'cyan' },
  { icon: '智', title: 'Agent 与工作流', description: '理解智能体的能力边界，并把 AI 接进真实工作与产品流程。', href: '/blog?tag=AI Agent', tone: 'violet' },
]

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
    <div className="home-page pb-8">
      <section className="knowledge-hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-glow hero-glow-one" aria-hidden="true" />
        <div className="hero-glow hero-glow-two" aria-hidden="true" />

        <div className="relative z-10 grid items-center gap-14 lg:grid-cols-[1.05fr_.95fr] lg:gap-10">
          <div className="max-w-3xl">
            <div className="hero-kicker">
              <span className="hero-kicker-dot" />
              AI KNOWLEDGE PLATFORM
              <span className="text-text-tertiary">持续更新</span>
            </div>
            <h1 className="mt-7 text-[clamp(3.25rem,7vw,6.8rem)] font-semibold leading-[.95] tracking-[-0.065em] text-text-primary">
              把 AI 天书，<br />
              <span className="gradient-text">讲成人话。</span>
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-8 text-text-secondary sm:text-lg sm:leading-9">
              一座为 AI 学习者打造的数字花园。用深度文章讲透原理，用著作构建体系，再用真实产品验证方法。
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/blog" className="primary-cta" data-analytics-event="explore_articles" data-analytics-target="home-hero">
                开始探索 <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/portfolio" className="secondary-cta" data-analytics-event="view_portfolio" data-analytics-target="home-hero">
                查看著作与作品
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-text-tertiary">
              <span className="hero-proof"><i />{posts.length} 篇深度内容</span>
              <span className="hero-proof"><i />{books.length} 本著作</span>
              <span className="hero-proof"><i />8500+ 同行读者</span>
            </div>
          </div>

          <div className="knowledge-console" aria-label="AI 知识体系概览">
            <div className="console-bar">
              <div className="flex gap-1.5" aria-hidden="true"><i /><i /><i /></div>
              <span>KNOWLEDGE_GRAPH.AI</span>
              <span className="console-status">ONLINE</span>
            </div>
            <div className="console-body">
              <div className="console-title-row">
                <div>
                  <p className="console-label">LEARNING PATH</p>
                  <h2>AI 知识图谱</h2>
                </div>
                <span className="console-index">01 — 04</span>
              </div>
              <div className="knowledge-core">
                <span className="core-ring ring-one" aria-hidden="true" />
                <span className="core-ring ring-two" aria-hidden="true" />
                <span className="core-node">AI</span>
                <span className="satellite satellite-one">RAG</span>
                <span className="satellite satellite-two">Agent</span>
                <span className="satellite satellite-three">Token</span>
                <span className="satellite satellite-four">GEO</span>
              </div>
              <div className="console-metrics">
                <div><span>原理认知</span><strong>92%</strong><i><b style={{ width: '92%' }} /></i></div>
                <div><span>工程实践</span><strong>78%</strong><i><b style={{ width: '78%' }} /></i></div>
                <div><span>行业观察</span><strong>86%</strong><i><b style={{ width: '86%' }} /></i></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell pt-24 sm:pt-32">
        <div className="section-heading">
          <div>
            <p className="eyebrow">KNOWLEDGE TRACKS</p>
            <h2>不是追热点，<br className="hidden sm:block" />是建立可复用的认知。</h2>
          </div>
          <p>围绕 AI 的底层原理、工程方法与产业变化，给每一个复杂概念找到清楚的入口。</p>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {knowledgeTracks.map((track, index) => (
            <Link key={track.title} href={track.href} className={`track-card track-${track.tone}`}>
              <div className="track-topline"><span>0{index + 1}</span><span>EXPLORE ↗</span></div>
              <div className="track-icon" aria-hidden="true">{track.icon}</div>
              <h3>{track.title}</h3>
              <p>{track.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-shell pt-24 sm:pt-32">
        <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">LATEST INSIGHTS</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-text-primary sm:text-5xl">最近发布</h2>
          </div>
          <Link href="/blog" className="section-link" data-analytics-event="explore_articles" data-analytics-target="home-latest">浏览全部文章 <span>→</span></Link>
        </div>

        <div className="insights-grid">
          {newest && (
            <Link href={newest.url} className="featured-insight group">
              <div className="featured-pattern" aria-hidden="true"><span>AI</span></div>
              <div className="relative z-10 flex h-full flex-col justify-between">
                <div className="flex items-center justify-between gap-4">
                  <span className="content-chip">NEW ESSAY</span>
                  <span className="text-xs text-white/55">{new Date(newest.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
                </div>
                <div className="mt-32 sm:mt-48">
                  <div className="mb-4 flex flex-wrap gap-2">{newest.tags?.slice(0, 3).map((tag) => <span key={tag} className="dark-tag">{tag}</span>)}</div>
                  <h3>{newest.title}</h3>
                  <p>{newest.description}</p>
                  <span className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-white">阅读全文 <b className="transition-transform group-hover:translate-x-1">→</b></span>
                </div>
              </div>
            </Link>
          )}

          <div className="insight-list">
            {latestPosts.map((post, index) => (
              <Link key={post._id} href={post.url} className="insight-row group">
                <div className="insight-number">0{index + 2}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                    <span>{post.tags?.[0] || 'AI'}</span><i />
                    <span>{post.readingTime} 分钟阅读</span>
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.description}</p>
                </div>
                <span className="insight-arrow">↗</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell pt-24 sm:pt-32">
        <div className="book-section">
          <div className="book-intro">
            <p className="eyebrow">PUBLICATIONS</p>
            <h2>从一个概念，<br />到一本书。</h2>
            <p>系统写作，是把零散理解变成完整认知的最好方式。</p>
            <Link href="/portfolio" className="section-link" data-analytics-event="view_portfolio" data-analytics-target="home-books">查看全部著作与作品 <span>→</span></Link>
          </div>
          <div className="book-shelf">
            {books.slice(0, 5).map((book, index) => {
              const content = (
                <>
                  <div className="book-cover">
                    {book.image ? (
                      <Image src={book.image} alt={`${book.title}封面`} fill className="object-contain" sizes="(max-width: 768px) 50vw, 190px" />
                    ) : (
                      <div className={`generated-cover cover-${index % 3}`}>
                        <span>芝士AI吃鱼 · 著作</span>
                        <strong>{book.title}</strong>
                        <small>{book.authors?.join(' · ')}</small>
                      </div>
                    )}
                  </div>
                  <h3>《{book.title}》</h3>
                  <p>{book.authors?.join('、')}</p>
                </>
              )
              return book.link ? <Link key={book.title} href={book.link} target="_blank" rel="noopener noreferrer" className="book-card" data-analytics-event="view_book" data-analytics-target={`home-book-${index + 1}`}>{content}</Link> : <article key={book.title} className="book-card">{content}</article>
            })}
          </div>
        </div>
      </section>

      <section className="section-shell pt-24 sm:pt-32">
        <div className="community-panel">
          <div>
            <span className="community-chip">WEEKLY SIGNAL</span>
            <h2>这周，大家都在读什么？</h2>
            <p>从真实阅读数据中，找到值得继续深挖的 AI 议题。</p>
          </div>
          <div className="community-list">
            {popularPosts.map((post, index) => (
              <Link key={post._id} href={post.url}>
                <span>0{index + 1}</span><strong>{post.title}</strong><i>→</i>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

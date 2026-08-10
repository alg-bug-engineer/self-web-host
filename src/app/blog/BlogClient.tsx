'use client'

import { useEffect, useState, useMemo } from 'react'
import { Post } from 'contentlayer/generated'
import AppCard from '@/components/AppCard'
import Link from 'next/link'

interface BlogClientProps {
  posts: Post[]
  bookCount: number
}

const CATEGORIES = [
  { id: 'all', name: '全部文章', keywords: [] },
  { id: 'principles', name: '模型与原理', keywords: ['GPT', 'Transformer', '深度学习', '大模型', 'RAG'] },
  { id: 'practice', name: 'Agent 与实践', keywords: ['Agent', '自动化工作流', '投资研究', 'GEO', 'SEO', 'openclaw'] },
  { id: 'insight', name: 'AI 与人', keywords: ['AI深度观察', 'AI原生一代', '科技哲学', '社会观察', '教育', '公众号同步', '愿景'] },
]

const LEARNING_PATHS = [
  {
    id: 'principles',
    index: '01',
    eyebrow: '理解模型',
    title: '从 200 行代码拆开 GPT',
    description: '先看见 Token、Attention 和训练过程如何连起来，再继续理解大模型。',
    href: '/blog/gpt-in-200-lines',
  },
  {
    id: 'practice',
    index: '02',
    eyebrow: '进入工程',
    title: '看清 Agent 从演示到落地的距离',
    description: '从能力边界、系统约束和真实部署出发，避免只停留在好看的 Demo。',
    href: '/blog/agent_demo_gap',
  },
  {
    id: 'insight',
    index: '03',
    eyebrow: '理解变化',
    title: '思考 AI 正在怎样重塑人',
    description: '把工具放回学习、工作和社会关系里，讨论效率之外更长期的影响。',
    href: '/blog/the-folding-time',
  },
]

const categoryMatches = (post: Post, categoryId: string) => {
  if (categoryId === 'all') return true
  const category = CATEGORIES.find((item) => item.id === categoryId)
  if (!category) return true
  return post.tags?.some((tag) =>
    category.keywords.some((keyword) => tag.toLowerCase().includes(keyword.toLowerCase())),
  ) || false
}

export default function BlogClient({ posts, bookCount }: BlogClientProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  useEffect(() => {
    const syncTagFromUrl = () => {
      setActiveTag(new URLSearchParams(window.location.search).get('tag'))
    }
    syncTagFromUrl()
    window.addEventListener('popstate', syncTagFromUrl)
    return () => window.removeEventListener('popstate', syncTagFromUrl)
  }, [])

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesSearch = 
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesCategory = categoryMatches(post, activeCategory)
      const matchesTag = !activeTag || post.tags?.includes(activeTag)

      return matchesSearch && matchesCategory && matchesTag
    })
  }, [posts, searchQuery, activeCategory, activeTag])

  const categoryCounts = useMemo(() => Object.fromEntries(
    CATEGORIES.map((category) => [
      category.id,
      posts.filter((post) => categoryMatches(post, category.id)).length,
    ]),
  ), [posts])

  const clearTag = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('tag')
    window.history.replaceState({}, '', `${url.pathname}${url.search}`)
    setActiveTag(null)
  }

  return (
    <section className="py-12 sm:py-20">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="relative overflow-hidden rounded-[1.75rem] border border-border-default bg-bg-secondary px-6 py-16 text-center mb-12 sm:px-12 sm:py-24">
          <div className="pointer-events-none absolute -right-28 -top-40 h-96 w-96 rounded-full bg-accent-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -left-28 h-80 w-80 rounded-full bg-accent-secondary/10 blur-3xl" />
          <p className="eyebrow relative">AI KNOWLEDGE BASE</p>
          <h1 className="relative mt-5 text-4xl sm:text-6xl font-semibold tracking-[-0.055em] text-text-primary">
            用人话，讲透 AI 原理。
          </h1>
          <p className="relative mt-5 text-text-secondary text-base leading-8 max-w-2xl mx-auto">
            从模型原理、Agent 实践到 AI 与人的长期变化。先找到适合自己的入口，再往深处走。
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-text-tertiary">
            <span><strong className="text-text-primary">{posts.length}</strong> 篇深度文章</span>
            <span aria-hidden="true">·</span>
            <Link href="/portfolio" className="transition-colors hover:text-accent-primary" data-analytics-event="view_portfolio" data-analytics-target="blog-proof">
              <strong className="text-text-primary">{bookCount}</strong> 本著作
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/about" className="transition-colors hover:text-accent-primary">8 年算法实践</Link>
          </div>
        </div>

        <section className="mb-12" aria-labelledby="learning-path-heading">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">START HERE</p>
              <h2 id="learning-path-heading" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-text-primary sm:text-3xl">不知道从哪篇开始？选一条路径。</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-text-secondary">不是按发布时间堆文章，而是按你此刻最想解决的问题组织阅读。</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {LEARNING_PATHS.map((path) => (
              <Link
                key={path.id}
                href={path.href}
                className="group relative overflow-hidden rounded-2xl border border-border-default bg-bg-secondary p-6 transition-all hover:-translate-y-1 hover:border-accent-primary/45 hover:shadow-xl"
                data-analytics-event="explore_articles"
                data-analytics-target={`blog-path-${path.id}`}
              >
                <span className="absolute right-4 top-2 text-6xl font-semibold text-text-primary/[.035]" aria-hidden="true">{path.index}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-tertiary">{path.index} · {path.eyebrow}</span>
                <h3 className="mt-5 max-w-xs text-lg font-semibold leading-7 text-text-primary">{path.title}</h3>
                <p className="mt-3 text-sm leading-6 text-text-secondary">{path.description}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent-tertiary">开始阅读 <b className="transition-transform group-hover:translate-x-1">→</b></span>
              </Link>
            ))}
          </div>
        </section>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-6 mb-10 items-center justify-between">
          {/* Categories */}
          <div className="grid grid-cols-2 gap-1 p-1 border border-border-default bg-bg-secondary rounded-xl w-full md:flex md:w-auto" aria-label="文章主题筛选">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                aria-pressed={activeCategory === cat.id}
                data-analytics-event="explore_articles"
                data-analytics-target={`blog-filter-${cat.id}`}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeCategory === cat.id
                    ? 'bg-accent-primary text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span>{cat.name}</span>
                <span className={activeCategory === cat.id ? 'text-white/70' : 'text-text-tertiary'}>{categoryCounts[cat.id]}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full md:w-80">
            <label htmlFor="blog-search" className="sr-only">搜索文章或标签</label>
            <input
              id="blog-search"
              type="text"
              placeholder="搜索文章、标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-bg-secondary border border-border-default rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all text-text-primary"
            />
            <svg
              className="absolute left-3 top-3 w-5 h-5 text-text-tertiary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {/* Active Tag Filter Indicator */}
        {activeTag && (
          <div className="flex items-center gap-2 mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="text-text-secondary">正在筛选标签:</span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-accent-primary/10 text-accent-primary font-medium text-sm">
              {activeTag}
              <button onClick={clearTag} className="hover:text-accent-primary/70">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            </span>
          </div>
        )}

        {/* Post List */}
        {filteredPosts.length === 0 ? (
          <div className="text-center py-20 bg-bg-secondary/50 rounded-3xl border border-dashed border-border-default">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-text-secondary text-lg">没有找到相关文章，换个关键词试试？</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredPosts.map((post) => (
              <AppCard key={post.slug} repository={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

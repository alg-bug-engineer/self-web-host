'use client'

import { useEffect, useState, useMemo } from 'react'
import { Post } from 'contentlayer/generated'
import AppCard from '@/components/AppCard'
import Link from 'next/link'
import { isCommentary } from '@/lib/commentary.mjs'

interface BlogClientProps {
  posts: Post[]
}

const CATEGORIES = [
  { id: 'all', name: '全部文章', keywords: [] },
  { id: 'commentary', name: 'AI锐评', keywords: [] },
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
  if (categoryId === 'commentary') return isCommentary(post)
  if (isCommentary(post)) return false
  const category = CATEGORIES.find((item) => item.id === categoryId)
  if (!category) return true
  if (categoryId === 'practice' && post.topicCluster === 'ai-practice-toolchain') return true
  return post.tags?.some((tag) =>
    category.keywords.some((keyword) => tag.toLowerCase().includes(keyword.toLowerCase())),
  ) || false
}

export default function BlogClient({ posts }: BlogClientProps) {
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
    <section className="py-10 sm:py-16">
      <div className="mx-auto max-w-6xl">
        <header className="mb-12 border-b border-border-default pb-10">
          <p className="eyebrow">文章与学习路径</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-text-primary sm:text-5xl">
            用人话，讲透 AI 原理。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-text-secondary">
            从模型原理、Agent 实践到 AI 与人的长期变化。先找到适合自己的入口，再往深处走。
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-tertiary">
            <span><strong className="text-text-primary">{posts.length}</strong> 篇文章</span>
            <span aria-hidden="true">·</span>
            <Link href="/commentary" className="transition-colors hover:text-accent-primary">AI锐评：热点与每日观点</Link>
            <span aria-hidden="true">·</span>
            <Link href="/portfolio" className="transition-colors hover:text-accent-primary" data-analytics-event="view_portfolio" data-analytics-target="blog-proof">查看著作与作品</Link>
            <span aria-hidden="true">·</span>
            <Link href="/about" className="transition-colors hover:text-accent-primary">8 年算法实践</Link>
          </div>
        </header>

        <section className="mb-12" aria-labelledby="learning-path-heading">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">建议入口</p>
              <h2 id="learning-path-heading" className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-text-primary sm:text-3xl">不知道从哪篇开始？选一条路径。</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-text-secondary">不是按发布时间堆文章，而是按你此刻最想解决的问题组织阅读。</p>
          </div>
          <div className="border-y border-border-default">
            {LEARNING_PATHS.map((path) => (
              <Link
                key={path.id}
                href={path.href}
                className="group grid gap-3 border-b border-border-default py-5 last:border-b-0 sm:grid-cols-[56px_1fr_1fr_auto] sm:items-center"
                data-analytics-event="explore_articles"
                data-analytics-target={`blog-path-${path.id}`}
              >
                <span className="font-mono text-xs text-text-tertiary">{path.index}</span>
                <div><span className="text-xs font-medium text-accent-tertiary">{path.eyebrow}</span><h3 className="mt-1 text-base font-semibold leading-7 text-text-primary group-hover:text-accent-primary">{path.title}</h3></div>
                <p className="text-sm leading-6 text-text-secondary">{path.description}</p>
                <span className="text-sm font-medium text-accent-primary">开始阅读 →</span>
              </Link>
            ))}
          </div>
        </section>

        {/* Filters & Search */}
        <div className="flex flex-col xl:flex-row gap-6 mb-10 items-center justify-between">
          {/* Categories */}
          <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-md border border-border-default bg-border-default lg:flex lg:w-auto" aria-label="文章主题筛选">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                aria-pressed={activeCategory === cat.id}
                data-analytics-event="explore_articles"
                data-analytics-target={`blog-filter-${cat.id}`}
                className={`flex items-center justify-center gap-2 bg-bg-secondary px-4 py-2 text-sm font-medium transition-colors ${
                  activeCategory === cat.id
                    ? '!bg-accent-primary text-white'
                    : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
                }`}
              >
                <span>{cat.name}</span>
                <span className={activeCategory === cat.id ? 'text-white/70' : 'text-text-tertiary'}>{categoryCounts[cat.id]}</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full xl:w-80 xl:shrink-0">
            <label htmlFor="blog-search" className="sr-only">搜索文章或标签</label>
            <input
              id="blog-search"
              type="text"
              placeholder="搜索文章、标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-border-default bg-bg-secondary py-2.5 pl-10 pr-4 text-text-primary transition-colors focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/20"
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
          <div className="mb-8 flex items-center gap-2">
            <span className="text-text-secondary">正在筛选标签:</span>
            <span className="inline-flex items-center gap-1 rounded border border-accent-primary/20 bg-accent-primary/10 px-3 py-1 text-sm font-medium text-accent-primary">
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
          <div className="border border-dashed border-border-default bg-bg-secondary py-16 text-center">
            <p className="text-lg text-text-secondary">没有找到相关文章，换个关键词试试。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredPosts.map((post) => (
              <AppCard key={post.slug} repository={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

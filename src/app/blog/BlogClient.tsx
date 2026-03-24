'use client'

import { useState, useMemo } from 'react'
import { Post } from 'contentlayer/generated'
import AppCard from '@/components/AppCard'
import { useSearchParams, useRouter } from 'next/navigation'

interface BlogClientProps {
  posts: Post[]
}

const CATEGORIES = [
  { id: 'all', name: '全部文章' },
  { id: 'tech', name: '技术科普' },
  { id: 'life', name: '社科感慨' },
]

export default function BlogClient({ posts }: BlogClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Get active tag/category from URL
  const activeTag = searchParams.get('tag')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchesSearch = 
        post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesCategory = activeCategory === 'all' || post.category === activeCategory
      const matchesTag = !activeTag || post.tags?.includes(activeTag)

      return matchesSearch && matchesCategory && matchesTag
    })
  }, [posts, searchQuery, activeCategory, activeTag])

  const clearTag = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('tag')
    router.push(`/blog?${params.toString()}`)
  }

  return (
    <section className="py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            博客文章
          </h1>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto">
            深度技术文章，用人话讲透 AI 原理
          </p>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-6 mb-12 items-center justify-between">
          {/* Categories */}
          <div className="flex p-1 bg-bg-tertiary rounded-xl w-full md:w-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                  activeCategory === cat.id
                    ? 'bg-bg-secondary text-accent-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder="搜索文章、标签..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-bg-tertiary border border-border-default rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all text-text-primary"
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPosts.map((post) => (
              <AppCard key={post.slug} repository={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

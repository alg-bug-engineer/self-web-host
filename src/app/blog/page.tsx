import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import BlogClient from './BlogClient'
import { Suspense } from 'react'

export const metadata = {
  title: '博客文章 | 芝士AI吃鱼',
  description: 'AI 技术博客，深度解析大模型、Transformer、RAG 等前沿技术',
}

export default function BlogPage() {
  const posts = allPosts
    .filter((post) => post.published)
    .sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)))

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent-primary"></div>
      </div>
    }>
      <BlogClient posts={posts} />
    </Suspense>
  )
}
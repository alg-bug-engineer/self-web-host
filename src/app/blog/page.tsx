import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import AppCard from '@/components/AppCard'

export const metadata = {
  title: '博客文章 | 芝士AI吃鱼',
  description: 'AI 技术博客，深度解析大模型、Transformer、RAG 等前沿技术',
}

export default function BlogPage() {
  const posts = allPosts
    .filter((post) => post.published)
    .sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)))

  return (
      <section className="py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-text-primary mb-4">
              博客文章
            </h1>
            <p className="text-text-secondary text-lg max-w-2xl mx-auto">
              深度技术文章，用人话讲透 AI 原理
            </p>
          </div>

          {/* Post List */}
          {posts.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🐱</div>
              <p className="text-text-secondary text-lg">暂时还没有文章，敬请期待...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <AppCard key={post.slug} repository={post} />
              ))}
            </div>
          )}
        </div>
      </section>
  )
}
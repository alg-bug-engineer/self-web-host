import Link from 'next/link'
import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'

export const metadata = {
  title: '文章合集 | 芝士AI吃鱼',
  description: '精选文章排行与最新内容速览。',
  alternates: { canonical: '/blog' },
}

const tagTones = ['label-blue', 'label-green', 'label-purple', 'label-orange', 'label-red']

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })

export default function ArticlesCollectionPage() {
  const posts = allPosts
    .filter((post) => post.published)
    .sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)))

  const topThree = posts.slice(0, 3)
  const rest = posts.slice(3)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">文章合集</h1>
        <p className="text-sm text-text-secondary">每周更新的内容排行与精选文章。</p>
      </div>

      {topThree.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {topThree.map((post, index) => (
            <Link
              key={post._id}
              href={post.url}
              className="bg-bg-secondary border border-border-default rounded-2xl p-5 flex flex-col gap-4 hover:border-accent-tertiary hover:shadow-lg transition-all group"
            >
              <div className="flex items-center justify-between text-xs text-text-tertiary">
                <span className="uppercase tracking-widest">Rank #{index + 1}</span>
                <span className="text-base">{post.icon === 'cat' ? '🐱' : '🤖'}</span>
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-text-primary group-hover:text-accent-tertiary transition-colors">
                  {post.title}
                </h2>
                <p className="text-sm text-text-secondary line-clamp-2">{post.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <span>{formatDate(post.date)}</span>
                <span>· {post.readingTime} 分钟</span>
                {(post.tags || []).slice(0, 2).map((tag, tagIndex) => (
                  <span key={tag} className={`label ${tagTones[tagIndex % tagTones.length]}`}>
                    {tag}
                  </span>
                ))}
              </div>
              <span className="text-xs text-accent-tertiary group-hover:underline">查看文章 →</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="blankslate">
          <div className="blankslate-icon">🐱</div>
          <h3 className="blankslate-heading">暂无文章</h3>
          <p className="blankslate-description">稍后再来看看吧。</p>
        </div>
      )}

      {rest.length > 0 && (
        <div className="bg-bg-secondary border border-border-default rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">文章排行</h2>
            <span className="text-xs text-text-tertiary">最近更新</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-text-tertiary border-b border-border-default">
                  <th className="py-2 pr-4">Rank</th>
                  <th className="py-2 pr-4">文章</th>
                  <th className="py-2 pr-4">话题</th>
                  <th className="py-2 pr-4">阅读</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((post, index) => (
                  <tr
                    key={post._id}
                    className="border-b border-border-default last:border-b-0 hover:bg-bg-tertiary/50 transition-colors"
                  >
                    <td className="py-3 pr-4 text-text-secondary">#{index + 4}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-bg-tertiary border border-border-default flex items-center justify-center">
                          {post.icon === 'cat' ? '🐱' : '🤖'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-text-primary truncate">{post.title}</p>
                          <p className="text-xs text-text-secondary truncate">{post.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {(post.tags || []).slice(0, 2).map((tag, tagIndex) => (
                        <span key={tag} className={`label ${tagTones[tagIndex % tagTones.length]} mr-2`}>
                          {tag}
                        </span>
                      ))}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{post.readingTime} 分钟</td>
                    <td className="py-3">
                      <Link href={post.url} className="text-xs text-accent-tertiary">
                        查看 →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

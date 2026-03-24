import { allPosts } from 'contentlayer/generated'
import { notFound } from 'next/navigation'
import { useMDXComponent } from 'next-contentlayer2/hooks'
import { mdxComponents } from '@/components/mdx'
import Link from 'next/link'
import Image from 'next/image'
import PlanetBanner from '@/components/PlanetBanner'
import WechatCard from '@/components/WechatCard'
import AppCard from '@/components/AppCard'
import { getSettings } from '@/lib/admin-storage'
import { compareDesc } from 'date-fns'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return allPosts.map((post) => ({
    slug: post.slug,
  }))
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const post = allPosts.find((post) => post.slug === slug)

  if (!post) {
    return { title: '文章未找到' }
  }

  return {
    title: `${post.title} | 芝士AI吃鱼`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
    },
  }
}

function MDXContent({ code }: { code: string }) {
  const Component = useMDXComponent(code)
  return <Component components={mdxComponents} />
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = allPosts.find((post) => post.slug === slug)
  const settings = await getSettings()

  if (!post) {
    notFound()
  }

  // Get sorted posts for navigation
  const sortedPosts = allPosts
    .filter((p) => p.published)
    .sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)))
  
  const currentIndex = sortedPosts.findIndex((p) => p.slug === slug)
  const nextPost = currentIndex > 0 ? sortedPosts[currentIndex - 1] : null
  const prevPost = currentIndex < sortedPosts.length - 1 ? sortedPosts[currentIndex + 1] : null

  // Get recommended posts based on common tags
  const recommendedPosts = sortedPosts
    .filter((p) => p.slug !== slug)
    .map((p) => {
      const commonTags = p.tags?.filter((tag) => post.tags?.includes(tag)).length || 0
      return { ...p, score: commonTags }
    })
    .sort((a, b) => b.score - a.score || compareDesc(new Date(a.date), new Date(b.date)))
    .slice(0, 2)

  // JSON-LD structured data for Google
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: post.title,
    description: post.description,
    image: post.cover || 'https://www.ai-knowledgepoints.cn/og-image.png',
    datePublished: post.date,
    author: {
      '@type': 'Person',
      name: post.author,
    },
    publisher: {
        '@type': 'Organization',
        name: '芝士AI吃鱼',
        logo: {
            '@type': 'ImageObject',
            url: 'https://www.ai-knowledgepoints.cn/favicon.ico'
        }
    }
  }

  return (
    <article className="py-8">
      {/* Inject JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-3xl mx-auto">
        {/* Back link */}
        <Link
          href="/blog"
          className="inline-flex items-center text-text-secondary hover:text-accent-primary transition-colors mb-8"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回博客列表
        </Link>

        {/* Header */}
        <header className="mb-10">
          {/* Category & Tags */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="px-3 py-1 text-sm font-bold rounded-lg bg-bg-tertiary text-text-primary border border-border-default flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse"></span>
              {post.category === 'tech' ? '技术科普' : '社科感慨'}
            </span>
            <div className="h-4 w-[1px] bg-border-default mx-1"></div>
            {post.tags?.map((tag) => (
              <Link
                key={tag}
                href={`/blog?tag=${encodeURIComponent(tag)}`}
                className="px-3 py-1 text-sm font-medium rounded-full bg-accent-primary/10 text-accent-primary hover:bg-accent-primary hover:text-text-on-emphasis transition-all"
              >
                #{tag}
              </Link>
            ))}
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-text-primary mb-6 leading-tight">
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-4 text-text-secondary">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{post.icon === 'cat' ? '🐱' : '🤖'}</span>
              <span>{post.author}</span>
            </div>
            <span>·</span>
            <span>{new Date(post.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span>·</span>
            <span>{post.readingTime} 分钟阅读</span>
          </div>
        </header>

        {/* Cover Image */}
        {post.cover && (
          <div className="mb-10 rounded-2xl overflow-hidden relative aspect-video">
            <Image
              src={post.cover}
              alt={post.title}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        {/* Content */}
        <div className="prose prose-lg max-w-none mb-16">
          <MDXContent code={post.body.code} />
        </div>

        {/* Lead Gen Banner */}
        <div className="mb-8">
          <PlanetBanner 
            title="想要深入学习 AI 实战吗？" 
            description="加入知识星球，你可以获得本文配套的完整源码、进阶架构图，以及专属的技术答疑服务。" 
            planetUrl={settings.planetUrl}
            planetQrCode={settings.planetQrCode}
          />
        </div>

        {/* Wechat Subscription Card */}
        <div className="mb-16">
          <WechatCard />
        </div>

        {/* Post Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-12 border-t border-border-default pt-8">
          {prevPost ? (
            <Link href={prevPost.url} className="group p-4 rounded-2xl border border-border-default hover:border-accent-primary/50 transition-colors">
              <p className="text-sm text-text-tertiary mb-1 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                上一篇
              </p>
              <p className="font-medium text-text-primary group-hover:text-accent-primary transition-colors line-clamp-1">{prevPost.title}</p>
            </Link>
          ) : <div />}
          {nextPost ? (
            <Link href={nextPost.url} className="group p-4 rounded-2xl border border-border-default hover:border-accent-primary/50 transition-colors text-right">
              <p className="text-sm text-text-tertiary mb-1 flex items-center justify-end gap-1">
                下一篇
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </p>
              <p className="font-medium text-text-primary group-hover:text-accent-primary transition-colors line-clamp-1">{nextPost.title}</p>
            </Link>
          ) : <div />}
        </div>

        {/* Recommended Posts */}
        {recommendedPosts.length > 0 && (
          <div className="my-16">
            <h2 className="text-2xl font-bold text-text-primary mb-8">推荐阅读</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {recommendedPosts.map((p) => (
                <AppCard key={p.slug} repository={p} />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-border-default">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{post.icon === 'cat' ? '🐱' : '🤖'}</span>
              <div>
                <p className="font-semibold text-text-primary">{post.author}</p>
                <p className="text-text-secondary text-sm">用人话讲透 AI</p>
              </div>
            </div>

            <Link
              href="/blog"
              className="inline-flex items-center px-4 py-2 bg-bg-tertiary text-text-primary rounded-full hover:bg-bg-secondary transition-colors"
            >
              更多文章
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </footer>
      </div>
    </article>
  )
}

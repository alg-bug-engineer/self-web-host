import { allPosts } from 'contentlayer/generated'
import { notFound } from 'next/navigation'
import { useMDXComponent } from 'next-contentlayer2/hooks'
import { mdxComponents } from '@/components/mdx'
import Link from 'next/link'
import Image from 'next/image'
import PlanetBanner from '@/components/PlanetBanner'
import PlanetGate from '@/components/PlanetGate'
import WechatCard from '@/components/WechatCard'
import AppCard from '@/components/AppCard'
import { getSettings } from '@/lib/admin-storage'
import { compareDesc } from 'date-fns'
import ArticleViewCounter from '@/components/ArticleViewCounter'
import ArticleReadingGuide from '@/components/ArticleReadingGuide'
import { BRAND_NAME, SITE_URL, absoluteUrl } from '@/lib/site'
import { extractArticleHeadings } from '@/lib/article-headings.mjs'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return allPosts.filter((post) => post.published).map((post) => ({
    slug: post.slug,
  }))
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const post = allPosts.find((post) => post.slug === slug && post.published)

  if (!post) {
    return { title: '文章未找到' }
  }

  return {
    title: post.title,
    description: post.description,
    keywords: post.tags,
    alternates: {
      canonical: post.url,
      types: { 'text/markdown': `${post.url}/index.html.md` },
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      url: absoluteUrl(post.url),
      publishedTime: post.date,
      authors: [post.author],
      tags: post.tags,
      images: post.cover
        ? [{ url: absoluteUrl(post.cover), alt: post.title }]
        : [{ url: absoluteUrl('/og.png'), alt: `${BRAND_NAME}：把 AI 天书，讲成人话` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [post.cover ? absoluteUrl(post.cover) : absoluteUrl('/og.png')],
    },
  }
}

function MDXContent({ code }: { code: string }) {
  const Component = useMDXComponent(code)
  return <Component components={mdxComponents} />
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params
  const post = allPosts.find((post) => post.slug === slug && post.published)
  const settings = await getSettings()

  if (!post) {
    notFound()
  }
  const articleHeadings = extractArticleHeadings(post.body.raw)

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
  const articleId = `${absoluteUrl(post.url)}#article`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': articleId,
        headline: post.title,
        description: post.description,
        mainEntityOfPage: absoluteUrl(post.url),
        isPartOf: { '@id': `${SITE_URL}/#website` },
        image: post.cover ? absoluteUrl(post.cover) : absoluteUrl('/og.png'),
        datePublished: post.date,
        dateModified: post.date,
        inLanguage: 'zh-CN',
        articleSection: post.category === 'tech' ? 'AI 技术科普' : 'AI 与社会观察',
        keywords: post.tags?.join(', '),
        citation: post.sourceUrl || undefined,
        author: { '@id': `${SITE_URL}/#person`, name: post.author || BRAND_NAME },
        publisher: { '@id': `${SITE_URL}/#person` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${absoluteUrl(post.url)}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首页', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '文章', item: `${SITE_URL}/blog` },
          { '@type': 'ListItem', position: 3, name: post.title, item: absoluteUrl(post.url) },
        ],
      },
    ],
  }

  return (
    <article className="py-8 sm:py-12">
      {/* Inject JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-6xl">
        {/* Back link */}
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center text-sm text-text-secondary transition-colors hover:text-accent-primary"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回文章列表
        </Link>

        {/* Header */}
        <header className="mx-auto mb-10 max-w-[744px] border-b border-border-default pb-8">
          {/* Category & Tags */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded border border-border-default bg-bg-secondary px-2.5 py-1 text-sm font-medium text-text-secondary">
              {post.category === 'tech' ? '技术科普' : '社科感慨'}
            </span>
            {post.access === 'planet-preview' && (
              <span className="rounded border border-accent-tertiary/30 bg-[var(--accent-planet-subtle)] px-2.5 py-1 text-sm font-medium text-accent-tertiary">
                AI 实践公开预览
              </span>
            )}
            {post.tags?.map((tag) => (
              <Link
                key={tag}
                href={`/blog?tag=${encodeURIComponent(tag)}`}
                className="px-1 py-1 text-sm text-text-tertiary transition-colors hover:text-accent-primary hover:underline"
              >
                #{tag}
              </Link>
            ))}
          </div>

          {/* Title */}
          <h1 className="mb-6 text-3xl font-bold leading-tight tracking-[-0.03em] text-text-primary sm:text-4xl lg:text-[2.75rem]">
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-text-secondary">
            <span>{post.author}</span>
            <span aria-hidden="true">·</span>
            <span>{new Date(post.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            <span aria-hidden="true">·</span>
            <span>{post.readingTime} 分钟阅读</span>
            <span aria-hidden="true">·</span>
            <ArticleViewCounter path={post.url} />
          </div>
          {post.sourceUrl && (
            <p className="mt-4 text-sm text-text-tertiary">
              来源：
              <a
                href={post.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-tertiary hover:underline"
              >
                {post.sourceName || '芝士AI吃鱼公众号'}
              </a>
            </p>
          )}
        </header>

        {/* Cover Image */}
        {post.cover && (
          <div className="relative mx-auto mb-10 aspect-video max-w-4xl overflow-hidden rounded-md border border-border-default bg-bg-secondary">
            <Image
              src={post.cover}
              alt={post.title}
              fill
              className="object-contain bg-bg-secondary"
              priority
            />
          </div>
        )}

        <div className="article-reading-layout">
          <aside className="article-reading-rail">
            <ArticleReadingGuide headings={articleHeadings} />
          </aside>
          <div className="min-w-0 max-w-3xl">
            {/* Content */}
            <div data-article-content className="article-content prose prose-lg max-w-none mb-16">
              <MDXContent code={post.body.code} />
            </div>

        {/* Lead Gen Banner */}
        <div className="mb-8">
          {post.access === 'planet-preview' && post.planetTopicUrl ? (
            <PlanetGate
              slug={post.slug}
              title={post.gateTitle || '完整实操已整理好'}
              description={post.gateDescription || '命令、配置与排错记录继续放在 AI 实践原帖。'}
              items={post.gateItems}
              topicUrl={post.planetTopicUrl}
              planetUrl={settings.planetUrl || 'https://wx.zsxq.com/group/28882182852411'}
              planetQrCode={settings.planetQrCode}
            />
          ) : (
            <PlanetBanner
              title="想把本文的问题继续做深一点？"
              description="知识星球里会继续整理相关案例、工程约束和问题讨论；具体内容以当前社区页面为准。"
              planetUrl={settings.planetUrl}
              planetQrCode={settings.planetQrCode}
            />
          )}
        </div>

        {/* Wechat Subscription Card */}
        <div className="mb-16">
          <WechatCard analyticsTarget="article-card" />
        </div>

        {/* Post Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-12 border-t border-border-default pt-8">
          {prevPost ? (
            <Link href={prevPost.url} className="group rounded-md border border-border-default p-4 transition-colors hover:border-card-hover-border">
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
            <Link href={nextPost.url} className="group rounded-md border border-border-default p-4 text-right transition-colors hover:border-card-hover-border">
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
        <footer className="mt-16 border-t border-border-default pt-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-text-primary">{post.author}</p>
              <p className="text-sm text-text-secondary">持续记录 AI 原理和工程实践</p>
            </div>

            <Link
              href="/blog"
              className="inline-flex items-center rounded-md border border-border-default bg-bg-secondary px-4 py-2 text-text-primary transition-colors hover:bg-bg-tertiary"
            >
              更多文章
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
            </footer>
          </div>
        </div>
      </div>
    </article>
  )
}

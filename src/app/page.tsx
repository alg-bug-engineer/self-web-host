import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import Link from 'next/link'
import Image from 'next/image'
import AppCard from '@/components/AppCard'
import { getTopPaths } from '@/lib/analytics-storage'
import portfolioData from 'content/collections/portfolio.json'

export const dynamic = 'force-dynamic'

type Book = {
  title: string
  type: string
  authors?: string[]
  image?: string
}

export default async function Home() {
  const posts = allPosts
    .filter((post) => post.published)
    .sort((a, b) => compareDesc(new Date(a.date), new Date(b.date)))
  const newest = posts[0]
  const latestPosts = posts.slice(1, 7)
  const books = (portfolioData as Book[]).filter((item) => item.type === 'book')
  const weeklyTopPaths = await getTopPaths({ days: 7, prefix: '/blog/', limit: 4 })
  const rankedPosts = weeklyTopPaths
    .map((item) => posts.find((post) => post.url === item.pathname))
    .filter((post): post is (typeof posts)[number] => Boolean(post))
  const popularPosts = (rankedPosts.length ? rankedPosts : posts.slice(0, 4)).slice(0, 4)

  return (
    <div className="space-y-24 pb-8">
      <section className="home-hero grid overflow-hidden rounded-[2rem] border border-border-default bg-bg-secondary lg:grid-cols-[1.18fr_.82fr]">
        <div className="relative flex min-h-[540px] flex-col justify-between p-7 sm:p-12 lg:p-14">
          <div className="home-orbit" aria-hidden="true" />
          <div className="relative z-10">
            <p className="eyebrow">Zhang Qilai · AI author & engineer</p>
            <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[1.03] tracking-[-0.055em] text-text-primary sm:text-7xl">
              把 AI 天书，<br />讲成人话。
            </h1>
            <p className="mt-7 max-w-2xl text-base leading-8 text-text-secondary sm:text-lg">
              用文章讲透大模型、RAG 与 Agent，用书构建完整认知，再用真实产品验证方法。
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/blog" className="rounded-full bg-text-primary px-6 py-3 text-sm font-medium text-bg-primary transition-transform hover:-translate-y-0.5">开始阅读</Link>
              <Link href="/portfolio" className="rounded-full border border-border-default bg-bg-primary/50 px-6 py-3 text-sm font-medium text-text-primary hover:border-text-tertiary">查看 5 本著作</Link>
            </div>
          </div>
          <div className="relative z-10 mt-14 grid max-w-xl grid-cols-3 gap-4 border-t border-border-default pt-6">
            <div><strong className="block text-2xl text-text-primary">5</strong><span className="text-xs text-text-tertiary">本著作</span></div>
            <div><strong className="block text-2xl text-text-primary">8+</strong><span className="text-xs text-text-tertiary">年算法经验</span></div>
            <div><strong className="block text-2xl text-text-primary">8500+</strong><span className="text-xs text-text-tertiary">公众号读者</span></div>
          </div>
        </div>

        {newest && (
          <Link href={newest.url} className="group flex min-h-[420px] flex-col justify-end border-t border-border-default bg-[#143d4b] p-7 text-white lg:border-l lg:border-t-0 sm:p-10">
            <div className="mb-auto flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/60">
              <span>Latest essay</span>
              <span>{new Date(newest.date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
            </div>
            <div className="mb-12 text-[7rem] leading-none opacity-15 transition-transform duration-500 group-hover:-translate-y-2" aria-hidden="true">思</div>
            <p className="text-sm text-white/65">本月公众号新文章</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{newest.title}</h2>
            <p className="mt-4 line-clamp-3 leading-7 text-white/72">{newest.description}</p>
            <span className="mt-7 text-sm font-medium">阅读全文 <span className="ml-2 inline-block transition-transform group-hover:translate-x-1">→</span></span>
          </Link>
        )}
      </section>

      <section>
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Books</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">从一个概念，到一本书</h2>
          </div>
          <Link href="/portfolio" className="text-sm text-text-secondary hover:text-text-primary">查看全部著作与作品 →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {books.map((book, index) => (
            <article key={book.title} className="group rounded-[1.5rem] border border-border-default bg-bg-secondary p-4">
              {book.image ? (
                <div className="relative aspect-[3/3.9] overflow-hidden rounded-[1rem] bg-white">
                  <Image src={book.image} alt={`${book.title}封面`} fill className="object-contain transition-transform duration-500 group-hover:scale-[1.025]" sizes="(max-width: 768px) 50vw, 220px" />
                </div>
              ) : (
                <div className={`flex aspect-[3/3.9] flex-col justify-between rounded-[1rem] bg-gradient-to-br ${index % 2 ? 'from-[#452e6b] to-[#9a5f88]' : 'from-[#174459] to-[#2d8490]'} p-5 text-white`}>
                  <span className="text-[10px] tracking-[0.22em] text-white/65">芝士AI吃鱼</span>
                  <span className="text-xl font-semibold leading-snug">{book.title}</span>
                </div>
              )}
              <h3 className="mt-4 line-clamp-2 text-sm font-semibold leading-6 text-text-primary">《{book.title}》</h3>
              <p className="mt-1 text-xs text-text-tertiary">{book.authors?.join('、')}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-12 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-7 flex items-end justify-between">
            <div><p className="eyebrow">Recent writing</p><h2 className="mt-2 text-3xl font-semibold text-text-primary">最近发布</h2></div>
            <Link href="/blog" className="text-sm text-text-secondary hover:text-text-primary">全部文章 →</Link>
          </div>
          <div className="grid gap-5 md:grid-cols-2">{latestPosts.map((post) => <AppCard key={post._id} repository={post} />)}</div>
        </div>
        <aside>
          <div className="sticky top-28 border-t-2 border-text-primary pt-5">
            <p className="eyebrow">Popular this week</p>
            <div className="mt-4 divide-y divide-border-default">
              {popularPosts.map((post, index) => (
                <Link key={post._id} href={post.url} className="group grid grid-cols-[32px_1fr] gap-3 py-5">
                  <span className="font-mono text-sm text-text-tertiary">0{index + 1}</span>
                  <div><h3 className="text-sm font-semibold leading-6 text-text-primary group-hover:text-accent-tertiary">{post.title}</h3><p className="mt-1 text-xs text-text-tertiary">{post.readingTime} 分钟阅读</p></div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}

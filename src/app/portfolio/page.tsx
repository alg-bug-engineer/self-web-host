import portfolioData from 'content/collections/portfolio.json'
import Link from 'next/link'
import Image from 'next/image'

type PortfolioItem = {
  title: string
  type: 'book' | 'website' | 'opensource'
  date?: string
  authors?: string[]
  description: string
  image?: string
  link?: string
  github?: string
  tags?: string[]
}

const items = portfolioData as PortfolioItem[]
const books = items.filter((item) => item.type === 'book')
const projects = items.filter((item) => item.type !== 'book')

function BookCover({ item, index }: { item: PortfolioItem; index: number }) {
  if (item.image) {
    return (
      <div className="relative aspect-[3/4.25] w-full overflow-hidden rounded-[1.35rem] bg-white shadow-[0_22px_45px_rgba(15,23,42,0.18)]">
        <Image src={item.image} alt={`${item.title}封面`} fill className="object-contain" sizes="(max-width: 768px) 70vw, 260px" />
      </div>
    )
  }

  const tones = ['from-[#153d57] to-[#28748a]', 'from-[#382566] to-[#81519b]']
  return (
    <div className={`aspect-[3/4.25] w-full rounded-[1.35rem] bg-gradient-to-br ${tones[index % tones.length]} p-7 text-white shadow-[0_22px_45px_rgba(15,23,42,0.2)]`}>
      <div className="flex h-full flex-col border border-white/25 p-5">
        <span className="text-xs tracking-[0.25em] text-white/65">芝士AI吃鱼 · 著作</span>
        <h3 className="mt-auto text-2xl font-semibold leading-snug">{item.title}</h3>
        <p className="mt-5 text-sm text-white/70">{item.authors?.join(' · ')}</p>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-20 py-8 sm:py-12">
      <header className="grid gap-8 border-b border-border-default pb-12 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
        <div>
          <p className="eyebrow">Books & Selected Work</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-text-primary sm:text-6xl">
            把复杂技术写成书，<br className="hidden sm:block" />也把想法做成产品。
          </h1>
        </div>
        <p className="max-w-xl text-base leading-8 text-text-secondary">
          张其来的著作与代表作品，覆盖大模型、RAG、GEO、Token 经济，以及持续迭代的 AI 内容与知识工具。
        </p>
      </header>

      <section>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Publications</p>
            <h2 className="mt-2 text-3xl font-semibold text-text-primary">已出版与即将出版</h2>
          </div>
          <span className="text-sm text-text-tertiary">共 {books.length} 本</span>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {books.map((book, index) => (
            <article key={book.title} className="group min-w-0">
              {book.link ? (
                <Link href={book.link} target="_blank" rel="noopener noreferrer" aria-label={`查看《${book.title}》`}>
                  <BookCover item={book} index={index} />
                </Link>
              ) : (
                <BookCover item={book} index={index} />
              )}
              <div className="px-1 pt-5">
                <h3 className="text-base font-semibold leading-6 text-text-primary">《{book.title}》</h3>
                <p className="mt-2 text-sm text-text-tertiary">{book.authors?.join('、')}</p>
                <p className="mt-3 text-sm leading-6 text-text-secondary">{book.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-8">
          <p className="eyebrow">Projects</p>
          <h2 className="mt-2 text-3xl font-semibold text-text-primary">产品与开源项目</h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {projects.map((item) => (
            <article key={item.title} className="overflow-hidden rounded-[1.75rem] border border-border-default bg-bg-secondary">
              <div className="relative aspect-[16/9] overflow-hidden bg-bg-tertiary">
                {item.image && <Image src={item.image} alt={item.title} fill className="object-cover transition-transform duration-500 hover:scale-[1.03]" sizes="(max-width: 1024px) 100vw, 33vw" />}
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-xl font-semibold text-text-primary">{item.title}</h3>
                  {item.date && <span className="shrink-0 text-xs text-text-tertiary">{new Date(item.date).getFullYear()}</span>}
                </div>
                <p className="mt-3 text-sm leading-7 text-text-secondary">{item.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.tags?.map((tag) => <span key={tag} className="label label-gray">{tag}</span>)}
                </div>
                <div className="mt-6 flex gap-5 text-sm font-medium">
                  {item.link && <Link href={item.link} target="_blank" rel="noopener noreferrer" className="text-accent-tertiary hover:underline">访问项目 ↗</Link>}
                  {item.github && <Link href={item.github} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-text-primary">GitHub ↗</Link>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

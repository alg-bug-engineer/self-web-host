import portfolioData from 'content/collections/portfolio.json'
import Link from 'next/link'
import Image from 'next/image'
import { BRAND_NAME, SITE_URL } from '@/lib/site'

export const metadata = {
  title: '著作与作品 | 芝士AI吃鱼',
  description: '芝士AI吃鱼的著作书名、AI 产品与开源项目。著作仅展示书名。',
  alternates: {
    canonical: '/portfolio',
    types: { 'text/markdown': '/portfolio/index.html.md' },
  },
}

type PortfolioItem = {
  title: string
  type: 'book' | 'website' | 'opensource'
  date?: string
  description?: string
  image?: string
  link?: string
  github?: string
  tags?: string[]
}

const items = portfolioData as PortfolioItem[]
const books = items.filter((item) => item.type === 'book')
const projects = items.filter((item) => item.type !== 'book')

function BookCover({ item, index }: { item: PortfolioItem; index: number }) {
  const tones = ['from-[#153d57] to-[#28748a]', 'from-[#382566] to-[#81519b]']
  return (
    <div className={`aspect-[3/4.25] w-full rounded-[1.35rem] bg-gradient-to-br ${tones[index % tones.length]} p-7 text-white shadow-[0_22px_45px_rgba(15,23,42,0.2)]`}>
      <div className="flex h-full flex-col border border-white/25 p-5">
        <span className="text-xs tracking-[0.25em] text-white/65">著作</span>
        <h3 className="mt-auto text-2xl font-semibold leading-snug">{item.title}</h3>
      </div>
    </div>
  )
}

export default function PortfolioPage() {
  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/portfolio#collection`,
    url: `${SITE_URL}/portfolio`,
    name: `${BRAND_NAME}的著作与作品`,
    about: { '@id': `${SITE_URL}/#person` },
    hasPart: items.map((item) => item.type === 'book'
      ? {
          '@type': 'Book',
          name: item.title,
          url: `${SITE_URL}/portfolio`,
        }
      : {
          '@type': 'CreativeWork',
          name: item.title,
          description: item.description,
          url: item.link || `${SITE_URL}/portfolio`,
          keywords: item.tags?.join(', '),
          datePublished: item.date,
          image: item.image ? `${SITE_URL}${item.image}` : undefined,
        }),
  }

  return (
    <div className="mx-auto max-w-7xl space-y-20 py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <header className="grid gap-8 border-b border-border-default pb-12 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
        <div>
          <p className="eyebrow">Books & Selected Work</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-text-primary sm:text-6xl">
            把复杂技术写成书，<br className="hidden sm:block" />也把想法做成产品。
          </h1>
        </div>
        <p className="max-w-xl text-base leading-8 text-text-secondary">
          著作区域仅保留书名；产品与开源项目继续展示公开说明。
        </p>
      </header>

      <section>
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Publications</p>
            <h2 className="mt-2 text-3xl font-semibold text-text-primary">已出版与即将出版</h2>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {books.map((book, index) => (
            <article key={book.title} className="group min-w-0">
              <BookCover item={book} index={index} />
              <div className="px-1 pt-5">
                <h3 className="text-base font-semibold leading-6 text-text-primary">《{book.title}》</h3>
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
          {projects.map((item, index) => (
            <article key={item.title} className="overflow-hidden rounded-[1.75rem] border border-border-default bg-bg-secondary">
              <div className="relative aspect-[16/9] overflow-hidden bg-bg-tertiary">
                {item.image ? (
                  <Image src={item.image} alt={item.title} fill className="object-cover transition-transform duration-500 hover:scale-[1.03]" sizes="(max-width: 1024px) 100vw, 33vw" />
                ) : (
                  <div className="absolute inset-0 flex items-end overflow-hidden bg-[radial-gradient(circle_at_78%_18%,rgba(82,190,255,.25),transparent_28%),linear-gradient(145deg,#102a43,#1b4965)] p-6 text-white">
                    <span className="absolute -right-8 -top-12 text-[9rem] font-semibold leading-none text-white/[.06]" aria-hidden="true">AI</span>
                    <div className="relative">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/55">Open-source work</span>
                      <strong className="mt-2 block max-w-sm text-xl leading-7">{item.title}</strong>
                    </div>
                  </div>
                )}
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
                  {item.link && <Link href={item.link} target="_blank" rel="noopener noreferrer" className="text-accent-tertiary hover:underline" data-analytics-event="visit_project" data-analytics-target={`project-${index + 1}`}>访问项目 ↗</Link>}
                  {item.github && <Link href={item.github} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-text-primary" data-analytics-event="visit_github" data-analytics-target={`project-${index + 1}`}>GitHub ↗</Link>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

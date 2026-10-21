import ProjectCard from '@/components/ProjectCard'
import { portfolioItems as items, books, products, openSourceProjects, type PortfolioItem } from '@/lib/portfolio'
import { BRAND_NAME, SITE_URL } from '@/lib/site'

export const metadata = {
  title: '著作与作品',
  description: '芝士AI吃鱼的著作与产品实践：公众号 CRM、AICap、Share Network、CogniFlow、内容工作台及企业小程序与管理系统。',
  alternates: {
    canonical: '/portfolio',
    types: { 'text/markdown': '/portfolio/index.html.md' },
  },
}

function BookCover({ item, index }: { item: PortfolioItem; index: number }) {
  const tones = ['#234e70', '#5b3f75', '#2f6f68']
  return (
    <div className="aspect-[3/4.25] w-full rounded-md p-6 text-white shadow-md" style={{ backgroundColor: tones[index % tones.length] }}>
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
          url: item.caseStudy || item.link || `${SITE_URL}/portfolio`,
          keywords: item.tags?.join(', '),
          image: item.image ? `${SITE_URL}${item.image}` : undefined,
        }),
  }

  return (
    <div className="mx-auto max-w-7xl space-y-20 py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }} />
      <header className="grid gap-8 border-b border-border-default pb-12 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
        <div>
          <p className="eyebrow">著作与作品</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] text-text-primary sm:text-5xl">
            把复杂技术写成书，<br className="hidden sm:block" />也把想法做成产品。
          </h1>
        </div>
        <div className="max-w-xl">
          <p className="text-base leading-8 text-text-secondary">从知识管理、AI 开发工具到企业运营系统，记录我把技术变成可用产品的实践，也分享持续创作的著作与开源资源。</p>
          <nav aria-label="作品分类" className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium text-accent-tertiary">
            <a href="#products" className="hover:underline">{products.length} 个产品案例 ↓</a>
            <a href="#books" className="hover:underline">{books.length} 部著作 ↓</a>
            <a href="#open-source" className="hover:underline">{openSourceProjects.length} 个开源计划 ↓</a>
          </nav>
        </div>
      </header>

      <section id="books" className="scroll-mt-24">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">著作</p>
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

      <section id="products" className="scroll-mt-24">
        <div className="mb-8">
          <p className="eyebrow">产品项目</p>
          <h2 className="mt-2 text-3xl font-semibold text-text-primary">产品与工程实践</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-text-secondary">以实际业务和使用场景为线索，展示功能、工程实现与交付形态。每个案例都保留独立入口，方便深入了解。</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {products.map((item, index) => <ProjectCard key={item.id || item.title} item={item} index={index} />)}
        </div>
      </section>

      <section id="open-source" className="scroll-mt-24">
        <div className="mb-8">
          <p className="eyebrow">开源与学习</p>
          <h2 className="mt-2 text-3xl font-semibold text-text-primary">开源知识与长期计划</h2>
          <p className="mt-3 text-sm leading-7 text-text-secondary">持续整理学习路径、工具与工程方法，让个人实践也成为可复用的资源。</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {openSourceProjects.map((item, index) => <ProjectCard key={item.title} item={item} index={products.length + index} />)}
        </div>
      </section>
    </div>
  )
}

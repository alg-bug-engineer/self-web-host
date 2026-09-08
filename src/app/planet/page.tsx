import Image from 'next/image'
import Link from 'next/link'
import { allPosts } from 'contentlayer/generated'
import { compareAsc } from 'date-fns'
import { getSettings } from '@/lib/admin-storage'
import { BRAND_NAME, SITE_URL } from '@/lib/site'

export const metadata = {
  title: `AI 实践｜把零散工具接成一套工作流 | ${BRAND_NAME}`,
  description: '从 Claude 注册、接口转换、配置切换、账号管理，到国产模型与本地生图：先读公开预览，再进入 AI 实践查看完整步骤。',
  alternates: { canonical: '/planet' },
  openGraph: {
    title: `AI 实践｜把零散工具接成一套工作流 | ${BRAND_NAME}`,
    description: '把 Claude Code、国产模型、账号管理和本地生图接成一套可以动手验证的工作流。',
    url: `${SITE_URL}/planet`,
    type: 'website',
  },
}

export default async function PlanetPage() {
  const settings = await getSettings()
  const externalJoinUrl = (() => {
    if (!settings.planetUrl) return null
    try {
      const url = new URL(settings.planetUrl)
      return url.protocol === 'https:' && url.hostname !== 'ai-knowledgepoints.cn'
        ? settings.planetUrl
        : null
    } catch {
      return null
    }
  })()
  const joinUrl = externalJoinUrl ?? '/about#wechat'
  const previewPosts = allPosts
    .filter((post) => post.published && post.access === 'planet-preview')
    .sort((a, b) => compareAsc(new Date(a.date), new Date(b.date)))

  const communityJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/planet#community`,
    url: `${SITE_URL}/planet`,
    name: `${BRAND_NAME} AI 实践`,
    description: '围绕 Claude Code、国产模型、账号管理和本地生图整理连续的技术实践路线。',
    about: [
      { '@type': 'Thing', name: 'AI 工程实践' },
      { '@type': 'Thing', name: 'Claude Code' },
      { '@type': 'Thing', name: '国产大模型' },
      { '@type': 'Thing', name: '儿童 AI 素养' },
    ],
    inLanguage: 'zh-CN',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    author: { '@id': `${SITE_URL}/#person`, name: BRAND_NAME },
  }

  return (
    <div className="mx-auto max-w-6xl space-y-20 px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(communityJsonLd) }} />

      <section className="relative overflow-hidden rounded-[2rem] border border-accent-primary/25 bg-bg-secondary px-6 py-12 shadow-xl md:px-12 md:py-16">
        <div aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent-primary/15 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-accent-tertiary/10 blur-3xl" />
        <div className="relative max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent-tertiary/10 px-3 py-1 text-sm font-medium text-accent-tertiary">
            <span className="h-2 w-2 rounded-full bg-accent-tertiary" />
            {BRAND_NAME} · AI 实践
          </div>
          <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-text-primary md:text-6xl">
            把 Claude Code、国产模型、账号管理和本地生图接成一套工作流
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-text-secondary">
            真正浪费时间的，往往不是某个工具不会装，而是账号、接口、配置和内容生产各自为战。这里把它们按真实使用顺序串起来：先看公开预览，确认值得做，再去完整教程里动手。
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href={joinUrl}
              target={joinUrl.startsWith('http') ? '_blank' : undefined}
              rel={joinUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="btn-primary px-8 py-3 text-lg"
              data-analytics-event="join_planet"
              data-analytics-target="planet-hero"
            >
              进入 AI 实践
            </a>
            <a href="#practice-route" className="btn-secondary px-8 py-3 text-lg">先看完整路线</a>
          </div>
        </div>
      </section>

      <section id="practice-route" className="scroll-mt-24 space-y-8">
        <div className="max-w-3xl">
          <p className="eyebrow">THE TOOLCHAIN</p>
          <h2 className="mt-2 text-3xl font-bold text-text-primary">8 个节点，不再收藏 8 篇互不相干的教程</h2>
          <p className="mt-3 leading-7 text-text-secondary">
            这条路线从账号入口开始，经过接口与配置，再走到多账号调度、国产模型和图像生产。每一篇都开放关键判断，具体命令和排错留在对应星球原帖。
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {previewPosts.map((post, index) => (
            <Link
              key={post.slug}
              href={post.url}
              className="group relative overflow-hidden rounded-2xl border border-border-default bg-bg-secondary p-6 transition hover:-translate-y-1 hover:border-accent-primary/50 hover:shadow-xl motion-reduce:transform-none"
            >
              <div className="flex items-start gap-4">
                <span className="font-mono text-2xl font-bold text-accent-primary/60">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold leading-7 text-text-primary group-hover:text-accent-primary">{post.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">{post.description}</p>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent-tertiary">
                    阅读公开预览 <span aria-hidden="true">→</span>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-8 rounded-3xl border border-accent-primary/25 bg-accent-primary/5 p-8 md:grid-cols-[1fr_auto] md:items-center md:p-12">
        <div>
          <p className="eyebrow">AI PRACTICE</p>
          <h2 className="mt-2 text-3xl font-bold text-text-primary">公开文章负责讲清楚，星球原帖负责让你照着做</h2>
          <p className="mt-4 max-w-2xl leading-7 text-text-secondary">
            完整命令、配置位置、操作截图和踩坑记录都保留在 AI 实践。加入前可以先把上面的公开预览逐篇看完，内容和加入方式以知识星球页面为准。
          </p>
          <a
            href={joinUrl}
            target={joinUrl.startsWith('http') ? '_blank' : undefined}
            rel={joinUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="btn-primary mt-6 inline-flex px-7 py-3"
            data-analytics-event="join_planet"
            data-analytics-target="planet-footer"
          >
            打开 AI 实践
          </a>
        </div>
        <a
          href={joinUrl}
          target={joinUrl.startsWith('http') ? '_blank' : undefined}
          rel={joinUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="justify-self-center rounded-2xl bg-white p-3 shadow-xl"
          aria-label="打开 AI 实践知识星球"
          data-analytics-event="join_planet"
          data-analytics-target="planet-footer"
        >
          <Image
            src={settings.planetQrCode || '/images/zhishixingqiu.jpg'}
            alt="AI 实践知识星球二维码"
            width={208}
            height={208}
            className="object-contain"
          />
        </a>
      </section>

      <section className="rounded-3xl border border-border-default bg-bg-secondary p-8 md:p-10">
        <div className="grid gap-6 md:grid-cols-[1.4fr_auto] md:items-center">
          <div>
            <p className="eyebrow">ANOTHER PRACTICE LINE</p>
            <h2 className="mt-2 text-2xl font-bold text-text-primary">另一条实践线：AI 原生一代</h2>
            <p className="mt-3 leading-7 text-text-secondary">
              除了开发者工具链，我还在试运行一套面向 8—14 岁孩子和家长的 AI 素养家庭实践课：理解 AI、验证答案、保护隐私，并完成一个亲子项目。
            </p>
            <p className="mt-3 text-sm leading-6 text-text-tertiary">
              这是独立项目线。知识星球共学和课程内测是两个不同选择，加入星球不自动获得课程内测名额；当前课程页面只登记意向，不收取内测费用。
            </p>
          </div>
          <Link
            href="/ai-native-generation"
            className="btn-secondary whitespace-nowrap px-6 py-3"
            data-analytics-event="ai_native_generation_interest"
            data-analytics-target="planet-pilot"
          >
            查看儿童 AI 素养计划
          </Link>
        </div>
      </section>
    </div>
  )
}

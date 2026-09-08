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
    <div className="mx-auto max-w-5xl space-y-20 py-10 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(communityJsonLd) }} />

      <section className="grid gap-10 border-b border-border-default pb-14 lg:grid-cols-[1fr_260px] lg:items-end">
        <div className="max-w-4xl">
          <p className="eyebrow">{BRAND_NAME} · AI 实践</p>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-[-0.04em] text-text-primary md:text-5xl">
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
              className="planet-primary px-7 py-3"
              data-analytics-event="join_planet"
              data-analytics-target="planet-hero"
            >
              进入 AI 实践
            </a>
            <a href="#practice-route" className="btn-secondary px-7 py-3">先看完整路线</a>
          </div>
        </div>
        <dl className="border-t-2 border-text-primary text-sm">
          <div className="flex justify-between border-b border-border-default py-3"><dt className="text-text-secondary">公开预览</dt><dd className="font-mono text-text-primary">{previewPosts.length} 篇</dd></div>
          <div className="flex justify-between border-b border-border-default py-3"><dt className="text-text-secondary">路线范围</dt><dd className="text-text-primary">账号 → 内容</dd></div>
          <div className="flex justify-between border-b border-border-default py-3"><dt className="text-text-secondary">完整实操</dt><dd className="text-accent-tertiary">知识星球原帖</dd></div>
        </dl>
      </section>

      <section id="practice-route" className="scroll-mt-24 space-y-8">
        <div className="max-w-3xl">
          <p className="eyebrow">实践路线</p>
          <h2 className="mt-3 text-3xl font-bold text-text-primary">8 个节点，不再收藏 8 篇互不相干的教程</h2>
          <p className="mt-3 leading-7 text-text-secondary">
            这条路线从账号入口开始，经过接口与配置，再走到多账号调度、国产模型和图像生产。每一篇都开放关键判断，具体命令和排错留在对应星球原帖。
          </p>
        </div>
        <ol className="relative ml-3 border-l border-border-default sm:ml-5">
          {previewPosts.map((post, index) => (
            <li key={post.slug} className="relative pl-9 sm:pl-12">
              <span className="absolute -left-3 top-7 flex h-6 w-6 items-center justify-center rounded-full border border-border-default bg-bg-primary font-mono text-[10px] text-text-tertiary">
                {String(index + 1).padStart(2, '0')}
              </span>
              <Link href={post.url} className="group grid gap-4 border-b border-border-default py-6 sm:grid-cols-[1fr_220px_auto] sm:items-center">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold leading-7 text-text-primary group-hover:text-accent-primary">{post.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{post.description}</p>
                </div>
                <span className="text-sm text-text-tertiary">{post.gateItems?.slice(0, 2).join('、')}</span>
                <span className="whitespace-nowrap text-sm font-medium text-accent-primary">阅读预览 →</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-8 rounded-lg border border-border-default border-l-[3px] border-l-accent-tertiary bg-bg-secondary p-7 md:grid-cols-[1fr_auto] md:items-center md:p-10">
        <div>
          <p className="text-sm font-semibold text-accent-tertiary">AI 实践</p>
          <h2 className="mt-2 text-3xl font-bold text-text-primary">公开文章负责讲清楚，星球原帖负责让你照着做</h2>
          <p className="mt-4 max-w-2xl leading-7 text-text-secondary">
            完整命令、配置位置、操作截图和踩坑记录都保留在 AI 实践。加入前可以先把上面的公开预览逐篇看完，内容和加入方式以知识星球页面为准。
          </p>
          <a
            href={joinUrl}
            target={joinUrl.startsWith('http') ? '_blank' : undefined}
            rel={joinUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="planet-primary mt-6 inline-flex px-7 py-3"
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
          className="justify-self-center rounded border border-border-default bg-white p-2"
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

      <section className="border-t border-border-default pt-10">
        <div className="grid gap-6 md:grid-cols-[1.4fr_auto] md:items-center">
          <div>
            <p className="eyebrow">另一条独立项目线</p>
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

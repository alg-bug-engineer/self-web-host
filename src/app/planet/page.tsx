import Image from 'next/image'
import Link from 'next/link'
import { getSettings } from '@/lib/admin-storage'
import { BRAND_NAME, SITE_URL } from '@/lib/site'

export const metadata = {
  title: `AI 实践学习社区｜儿童 AI 素养试运行 | ${BRAND_NAME}`,
  description: `${BRAND_NAME}整理大模型、RAG、Agent 与 AI 工程实践；当前主线是“AI 原生一代：儿童 AI 素养”家庭实践课试运行。知识星球共学与课程内测分别登记。`,
  alternates: { canonical: '/planet' },
  openGraph: {
    title: `AI 实践学习社区｜儿童 AI 素养试运行 | ${BRAND_NAME}`,
    description: '围绕大模型、RAG、Agent 与 AI 工程实践持续整理；当前主线是“AI 原生一代：儿童 AI 素养”家庭实践课试运行。',
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
  const hasExternalJoinUrl = Boolean(externalJoinUrl)
  const joinUrl = externalJoinUrl ?? '/about#wechat'
  const joinLabel = hasExternalJoinUrl ? '查看学习社区' : '联系作者了解'
  const communityJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/planet#community`,
    url: `${SITE_URL}/planet`,
    name: `${BRAND_NAME} AI 实践学习社区`,
    description: '围绕大模型、RAG、Agent 与 AI 工程实践整理专题内容；当前开展“AI 原生一代：儿童 AI 素养”家庭实践课试运行。',
    about: [
      { '@type': 'Thing', name: 'AI 工程实践' },
      { '@type': 'Thing', name: '儿童 AI 素养' },
      { '@type': 'Thing', name: '家庭 AI 教育' },
    ],
    inLanguage: 'zh-CN',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    author: { '@id': `${SITE_URL}/#person`, name: BRAND_NAME },
  }

  return (
    <div className="max-w-4xl mx-auto space-y-16 py-12 px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(communityJsonLd) }} />
      <section className="text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-tertiary/10 text-accent-tertiary text-sm font-medium">
          <span className="h-2 w-2 rounded-full bg-accent-tertiary" />
          {BRAND_NAME} · AI 实践学习社区
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-text-primary tracking-tight">
          把一个 AI 问题，继续做深一点
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl mx-auto">
          我会把大模型、RAG、Agent 和 AI 工程实践中的资料、案例与问题整理在这里。你可以先看公开文章，再判断这种学习方式是否适合自己。
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a 
            href={joinUrl}
            target={joinUrl.startsWith('http') ? '_blank' : undefined}
            rel={joinUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
            className="btn-primary px-8 py-3 text-lg"
            data-analytics-event="join_planet"
            data-analytics-target="planet-hero"
          >
            {joinLabel}
          </a>
          <Link href="/blog" className="btn-secondary px-8 py-3 text-lg">先读公开文章</Link>
        </div>
      </section>

      <section className="rounded-3xl border border-accent-tertiary/30 bg-accent-tertiary/5 p-8 md:p-10">
        <div className="grid gap-6 md:grid-cols-[1.4fr_auto] md:items-center">
          <div>
            <p className="eyebrow">CURRENT PILOT</p>
            <h2 className="mt-2 text-2xl font-bold text-text-primary">AI 原生一代：儿童 AI 素养家庭实践课</h2>
            <p className="mt-3 leading-7 text-text-secondary">
              当前用四周时间试运行一套面向 8—14 岁孩子和家长的课程：理解 AI、与 AI 协作、验证答案、保护隐私，并完成一个亲子项目。
            </p>
            <p className="mt-3 text-sm leading-6 text-text-tertiary">
              知识星球共学和课程内测是两个不同选择。加入星球不自动获得课程内测名额，孩子的自测、作业和答辩也不决定是否可以付费。
            </p>
          </div>
          <Link
            href="/ai-native-generation"
            className="btn-primary whitespace-nowrap px-6 py-3"
            data-analytics-event="ai_native_generation_interest"
            data-analytics-target="planet-pilot"
          >
            查看试运行计划
          </Link>
        </div>
        <div className="mt-6 border-t border-border-default pt-5 text-sm leading-6 text-text-secondary">
          只想登记课程内测意向的监护人，可以先查看
          <Link
            href="/ai-native-generation#guardian-beta-intake"
            className="ml-1 font-medium text-accent-primary hover:underline"
            data-analytics-event="ai_native_generation_interest"
            data-analytics-target="planet-pilot"
          >
            监护人登记步骤
          </Link>
          ；当前只登记意向，不收取课程内测费用。
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {[
          {
            title: '按问题整理',
            desc: '不追着每条新闻跑，围绕一个问题补齐背景、方法、证据和边界。',
            icon: '🎯',
          },
          {
            title: '连接原理与实践',
            desc: '从概念走到案例、代码和系统约束，说明方法在真实工程里怎样落地。',
            icon: '💻',
          },
          {
            title: '保留问题讨论',
            desc: '遇到不确定的地方就继续讨论，不把还没有答案的问题包装成标准结论。',
            icon: '🤝',
          },
        ].map((item, i) => (
          <div key={i} className="bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-3">
            <div className="text-3xl">{item.icon}</div>
            <h3 className="text-lg font-semibold text-text-primary">{item.title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </section>

      <section id="community-content" className="space-y-8 bg-bg-secondary border border-border-default rounded-3xl p-8 md:p-12">
        <div className="text-center">
          <p className="eyebrow">WHAT I SHARE</p>
          <h2 className="mt-2 text-3xl font-bold text-text-primary">这里主要整理什么</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
          {[
            { title: '专题内容', detail: '围绕大模型、RAG、Agent 和 AI 工程化，把零散知识整理成可以连续阅读的主题。' },
            { title: '案例与代码', detail: '在适合公开和复用的范围内，补充项目案例、架构说明与代码线索。' },
            { title: '实践问题', detail: '记录部署、评测、数据和产品落地中真正会遇到的问题，以及当时可行的处理方式。' },
            { title: '工具观察', detail: '关注值得动手验证的开源项目与模型能力，说明它解决了什么，也说明还缺什么。' },
          ].map((benefit, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent-tertiary/20 text-accent-tertiary flex items-center justify-center font-bold text-xs">
                ✓
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-text-primary">{benefit.title}</h4>
                <p className="text-sm text-text-secondary">{benefit.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="text-center space-y-8 pb-12">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary">{hasExternalJoinUrl ? '查看当前社区页面' : '获取当前社区信息'}</h2>
          <p className="text-sm text-text-tertiary">
            {hasExternalJoinUrl
              ? '具体内容、更新频率和加入方式，以知识星球页面展示的信息为准。'
              : '当前没有配置公开加入链接，可以通过公众号联系作者了解。'}
          </p>
        </div>
        <a
          href={joinUrl}
          target={joinUrl.startsWith('http') ? '_blank' : undefined}
          rel={joinUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="inline-block p-4 bg-white rounded-2xl shadow-xl"
          aria-label="查看芝士AI吃鱼知识星球"
          data-analytics-event="join_planet"
          data-analytics-target="planet-footer"
        >
          {settings.planetQrCode ? (
            <Image src={settings.planetQrCode} alt="芝士AI吃鱼知识星球二维码" width={192} height={192} className="object-contain" />
          ) : (
            <div className="w-48 h-48 bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 text-gray-400">
              <div className="text-center">
                <span className="text-4xl block mb-2">🪐</span>
                <span className="text-xs">{hasExternalJoinUrl ? '查看社区页面' : '联系作者了解'}</span>
              </div>
            </div>
          )}
        </a>
      </section>
    </div>
  )
}

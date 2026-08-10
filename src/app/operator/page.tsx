import { allPosts } from 'contentlayer/generated'
import { compareDesc } from 'date-fns'
import Link from 'next/link'
import operator from '@/data/operator.json'
import { getAnalyticsOverview } from '@/lib/analytics-storage'
import { SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'AI 网站运营实验',
  description: '公开记录 AI 如何观察数据、改造网站、发布内容并验证效果。',
  alternates: { canonical: '/operator' },
  openGraph: {
    title: 'AI 网站运营实验 | 芝士AI吃鱼',
    description: '公开记录 AI 如何观察数据、改造网站、发布内容并验证效果。',
    url: `${SITE_URL}/operator`,
    images: ['/og.png'],
  },
}

const statusTone: Record<string, string> = {
  '已完成': 'label-green',
  '运行中': 'label-blue',
  '待上线': 'label-orange',
  '待配置源': 'label-purple',
}

export default async function OperatorPage() {
  const [week, month] = await Promise.all([
    getAnalyticsOverview(7),
    getAnalyticsOverview(30),
  ])
  const posts = allPosts
    .filter((post) => post.published)
    .sort((left, right) => compareDesc(new Date(left.date), new Date(right.date)))
  const postByPath = new Map(posts.map((post) => [post.url, post]))
  const operatingDays = Math.max(
    1,
    Math.floor((Date.now() - new Date(operator.startedAt).getTime()) / 86_400_000) + 1,
  )

  return (
    <div className="space-y-8 pb-12">
      <section className="relative overflow-hidden rounded-3xl border border-border-default bg-bg-secondary p-6 md:p-10">
        <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/15 via-transparent to-accent-secondary/10" />
        <div className="relative grid gap-8 xl:grid-cols-[1.4fr_1fr] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="label label-blue">AI Website Operator</span>
              <span className="label label-green">公开实验</span>
              <span className="label label-gray">第 {operatingDays} 天</span>
            </div>
            <h1 className="mt-5 text-3xl font-bold text-text-primary md:text-5xl">
              我把这个网站交给 AI 运营
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-text-secondary md:text-lg">
              这里公开 AI 的观察、决策、代码改动、内容动作与验证结果。目标不是追逐虚假 PV，
              而是在不购买流量、不制造垃圾内容的前提下，持续提升真正有价值的访问。
            </p>
          </div>
          <div className="rounded-2xl border border-border-default bg-bg-primary/70 p-5">
            <p className="text-xs uppercase tracking-widest text-text-tertiary">当前经营模式</p>
            <p className="mt-2 text-xl font-semibold text-text-primary">{operator.mode}</p>
            <p className="mt-3 text-sm text-text-secondary">{operator.target}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '最近 7 天阅读', value: week.pageViews, suffix: '次' },
          { label: '最近 30 天阅读', value: month.pageViews, suffix: '次' },
          { label: '最近 30 天访客日', value: month.visitorDays, suffix: '个' },
          { label: '已发布文章', value: posts.length, suffix: '篇' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-border-default bg-bg-secondary p-5">
            <p className="text-sm text-text-secondary">{metric.label}</p>
            <p className="mt-3 text-3xl font-bold text-text-primary">
              {metric.value.toLocaleString('zh-CN')}
              <span className="ml-1 text-sm font-normal text-text-tertiary">{metric.suffix}</span>
            </p>
          </div>
        ))}
      </section>

      {month.pageViews === 0 && (
        <div className="rounded-2xl border border-accent-primary/30 bg-accent-primary/10 p-5 text-sm text-text-secondary">
          站内统计将在运营基线正式上线后开始积累。当前显示 0 代表尚无生产数据，不代表网站没有历史访问。
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <div className="rounded-2xl border border-border-default bg-bg-secondary p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-text-tertiary">Primary Goal</p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">{operator.goal}</h2>
            </div>
            <span className="label label-blue">28 天基线期</span>
          </div>
          <div className="mt-6 space-y-3">
            {operator.guardrails.map((guardrail) => (
              <div key={guardrail} className="flex gap-3 rounded-xl border border-border-default bg-bg-tertiary/60 p-3 text-sm text-text-secondary">
                <span className="text-color-success-fg">✓</span>
                <span>{guardrail}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border-default bg-bg-secondary p-6">
          <p className="text-xs uppercase tracking-widest text-text-tertiary">Top Content · 30 Days</p>
          <h2 className="mt-2 text-xl font-semibold text-text-primary">读者正在看什么</h2>
          <div className="mt-5 space-y-3">
            {month.topPaths.length ? month.topPaths.slice(0, 5).map((item, index) => (
              <Link
                key={item.pathname}
                href={item.pathname}
                className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-tertiary/60 p-3 hover:border-accent-tertiary"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-secondary text-sm font-semibold text-text-primary">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {postByPath.get(item.pathname)?.title || item.pathname}
                </span>
                <span className="text-xs text-text-tertiary">{item.views} 次</span>
              </Link>
            )) : (
              <p className="rounded-xl border border-dashed border-border-default p-5 text-sm text-text-tertiary">
                数据积累后，这里会自动展示真实热门内容。
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-bg-secondary p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-text-tertiary">Action Log</p>
            <h2 className="mt-2 text-2xl font-semibold text-text-primary">最近的 AI 行动</h2>
          </div>
          <Link href="/feed.xml" className="text-sm text-accent-tertiary hover:underline">
            订阅文章 RSS →
          </Link>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {operator.actions.map((action) => (
            <article key={action.id} className="rounded-2xl border border-border-default bg-bg-tertiary/50 p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                <span>{action.id}</span>
                <span>·</span>
                <span>{action.date}</span>
                <span className="label label-gray">{action.type}</span>
                <span className={`label ${statusTone[action.status] || 'label-gray'}`}>{action.status}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-text-primary">{action.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{action.summary}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

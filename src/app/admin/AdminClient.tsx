'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { AnalyticsOverview } from '@/lib/analytics-storage'

const defaultPostContent = `## 新文章\n\n用人话写清楚一个 AI 概念。\n\n<InfoCard type=\"robot\" title=\"核心观点\">\n  - 这里写要点\n</InfoCard>\n`

type AdminClientProps = {
  isAuthed: boolean
  analytics: AnalyticsOverview | null
}

const sourceLabel = (source: string) => {
  if (source === 'direct') return '直接访问'
  if (source === 'internal') return '站内跳转'
  const [kind, value] = source.split(':', 2)
  const labels: Record<string, string> = {
    campaign: '活动',
    search: '搜索',
    social: '社交',
    referral: '引荐',
  }
  return `${labels[kind] || kind} · ${value || source}`
}

const changeLabel = (change: number | null) => {
  if (change === null) return '首次有数据'
  if (change === 0) return '与上期持平'
  return `较上期 ${change > 0 ? '+' : ''}${change}%`
}

const vitalLabel = (name: string) => ({
  LCP: '最大内容绘制',
  INP: '交互响应',
  CLS: '布局稳定性',
}[name] || name)

const vitalRatingLabel = (rating: string) => ({
  good: '良好',
  'needs-improvement': '需要改进',
  poor: '较差',
  'insufficient-data': '等待数据',
}[rating] || rating)

const vitalRatingTone = (rating: string) => {
  if (rating === 'good') return 'label label-green'
  if (rating === 'poor') return 'label label-orange'
  if (rating === 'needs-improvement') return 'label label-purple'
  return 'label label-gray'
}

const vitalValue = (name: string, value: number | null) => {
  if (value === null) return '—'
  return name === 'CLS' ? value.toFixed(3) : `${Math.round(value)} ms`
}

export default function AdminClient({ isAuthed, analytics }: AdminClientProps) {
  const router = useRouter()
  const [autoPublish, setAutoPublish] = useState(false)
  const [publishStatus, setPublishStatus] = useState('')

  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginStatus, setLoginStatus] = useState('')

  const [postForm, setPostForm] = useState({
    title: '',
    slug: '',
    description: '',
    date: new Date().toISOString().slice(0, 10),
    tags: '',
    icon: 'robot',
    content: defaultPostContent,
  })
  const [postStatus, setPostStatus] = useState('')

  const [toolForm, setToolForm] = useState({
    name: '',
    description: '',
    url: '',
    tags: '',
    status: 'Active',
    isPro: false,
    type: 'link',
    pluginId: '',
  })
  const [toolStatus, setToolStatus] = useState('')

  const [settingsForm, setSettingsForm] = useState({
    planetQrCode: '',
    planetUrl: '',
    siteSlogan: '芝士AI吃鱼',
  })
  const [settingsStatus, setSettingsStatus] = useState('')

  useEffect(() => {
    if (isAuthed) {
      fetch('/api/admin/settings')
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.settings) {
            setSettingsForm(prev => ({ ...prev, ...data.settings }))
          }
        })
    }
  }, [isAuthed])

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoginStatus('登录中...')
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUsername, password: loginPassword }),
    })
    if (!response.ok) {
      setLoginStatus('登录失败，请检查账号或密码')
      return
    }
    setLoginStatus('登录成功，正在刷新...')
    router.refresh()
  }

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.refresh()
  }

  const triggerPublish = async () => {
    setPublishStatus('发布中...')
    const response = await fetch('/api/admin/publish', { method: 'POST' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setPublishStatus(data.message || '发布失败')
      return false
    }
    setPublishStatus(data.message || '发布完成')
    return true
  }

  const handlePostSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPostStatus('提交中...')
    const response = await fetch('/api/admin/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postForm),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setPostStatus(data.message || '提交失败')
      return
    }
    setPostStatus('文章已保存')
    setPostForm((prev) => ({ ...prev, title: '', slug: '', description: '', tags: '', content: defaultPostContent }))
    if (autoPublish) await triggerPublish()
  }

  const handleToolSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setToolStatus('提交中...')
    const response = await fetch('/api/admin/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toolForm),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setToolStatus(data.message || '提交失败')
      return
    }
    setToolStatus('工具已保存')
    setToolForm({
      name: '',
      description: '',
      url: '',
      tags: '',
      status: 'Active',
      isPro: false,
      type: 'link',
      pluginId: '',
    })
    if (autoPublish) await triggerPublish()
  }

  const handleSettingsSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSettingsStatus('保存中...')
    const response = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    })
    if (!response.ok) {
      setSettingsStatus('保存失败')
      return
    }
    setSettingsStatus('配置已保存')
    if (autoPublish) await triggerPublish()
  }

  if (!isAuthed) {
    return (
      <div className="max-w-md mx-auto bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-4">
        <h1 className="text-xl font-semibold text-text-primary">后台登录</h1>
        <p className="text-sm text-text-secondary">使用管理员账号登录后管理内容。</p>
        <form className="space-y-3" onSubmit={handleLogin}>
          <input
            value={loginUsername}
            onChange={(event) => setLoginUsername(event.target.value)}
            placeholder="账号"
            className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-accent-tertiary focus:border-transparent"
          />
          <input
            type="password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            placeholder="密码"
            className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-accent-tertiary focus:border-transparent"
          />
          <button type="submit" className="btn-primary px-4 py-2 text-sm">
            登录
          </button>
          {loginStatus && <p className="text-xs text-text-secondary">{loginStatus}</p>}
        </form>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">内容管理后台</h1>
          <p className="text-sm text-text-secondary">管理文章、工具及全站系统配置。</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={autoPublish}
              onChange={(event) => setAutoPublish(event.target.checked)}
              className="h-4 w-4 rounded border-border-default bg-bg-tertiary text-accent-primary focus:ring-accent-tertiary"
            />
            保存后自动发布
          </label>
          <button className="btn-secondary px-4 py-2 text-sm" onClick={triggerPublish}>
            立即发布
          </button>
          <button className="btn-danger px-4 py-2 text-sm" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </div>
      {publishStatus && <p className="text-xs text-text-tertiary">{publishStatus}</p>}

      {analytics && (
        <section className="space-y-5 rounded-2xl border border-border-default bg-bg-secondary p-5 sm:p-6" aria-labelledby="analytics-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-tertiary">Private analytics</p>
              <h2 id="analytics-heading" className="mt-1 text-lg font-semibold text-text-primary">最近 {analytics.days} 天网站表现</h2>
            </div>
            <p className="text-xs text-text-tertiary">访客按天匿名哈希；不保存原始 IP</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <p className="text-xs text-text-tertiary">页面浏览 PV</p>
              <strong className="mt-2 block text-2xl text-text-primary">{analytics.pageViews.toLocaleString('zh-CN')}</strong>
              <span className="mt-1 block text-xs text-text-secondary">{changeLabel(analytics.pageViewChange)}</span>
            </div>
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <p className="text-xs text-text-tertiary">每日独立访客合计</p>
              <strong className="mt-2 block text-2xl text-text-primary">{analytics.dailyVisitors.toLocaleString('zh-CN')}</strong>
              <span className="mt-1 block text-xs text-text-secondary">{changeLabel(analytics.visitorChange)}</span>
            </div>
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <p className="text-xs text-text-tertiary">回访读者信号</p>
              <strong className="mt-2 block text-2xl text-text-primary">{analytics.returningRate}%</strong>
              <span className="mt-1 block text-xs text-text-secondary">{analytics.returningDailyVisitors} 个每日回访信号</span>
            </div>
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <p className="text-xs text-text-tertiary">有效阅读率</p>
              <strong className="mt-2 block text-2xl text-text-primary">{analytics.engagementRate}%</strong>
              <span className="mt-1 block text-xs text-text-secondary">停留 ≥10 秒或阅读 ≥25%</span>
            </div>
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <p className="text-xs text-text-tertiary">热门页面数</p>
              <strong className="mt-2 block text-2xl text-text-primary">{analytics.topPaths.length}</strong>
              <span className="mt-1 block text-xs text-text-secondary">有访问记录的前 10 页</span>
            </div>
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <p className="text-xs text-text-tertiary">有效来源数</p>
              <strong className="mt-2 block text-2xl text-text-primary">{analytics.topSources.length}</strong>
              <span className="mt-1 block text-xs text-text-secondary">搜索、社交、引荐与活动</span>
            </div>
          </div>

          <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">真实用户体验 · Core Web Vitals</h3>
                <p className="mt-1 text-xs text-text-tertiary">最近 {analytics.days} 天第 75 百分位；Google 推荐 LCP ≤2.5s、INP ≤200ms、CLS ≤0.1</p>
              </div>
              <span className="text-xs text-text-tertiary">仅统计真实浏览器，尊重 DNT</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {analytics.webVitals.map((metric) => (
                <div key={metric.name} className="rounded-lg border border-border-default bg-bg-secondary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-text-tertiary">{metric.name} · {vitalLabel(metric.name)}</p>
                      <strong className="mt-2 block text-xl text-text-primary">{vitalValue(metric.name, metric.p75)}</strong>
                    </div>
                    <span className={vitalRatingTone(metric.rating)}>{vitalRatingLabel(metric.rating)}</span>
                  </div>
                  <p className="mt-3 text-xs text-text-tertiary">{metric.samples} 个匿名样本</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">访问趋势</h3>
                <span className="text-xs text-text-tertiary">PV / 日</span>
              </div>
              <div className="flex h-36 items-end gap-1" aria-label="最近 30 天页面浏览趋势">
                {analytics.timeline.map((point) => {
                  const maximum = Math.max(1, ...analytics.timeline.map((item) => item.pageViews))
                  const height = Math.max(point.pageViews ? 8 : 2, Math.round((point.pageViews / maximum) * 100))
                  return (
                    <div key={point.date} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${point.date}：${point.pageViews} PV / ${point.visitors} 访客`}>
                      <span className="w-full rounded-t-sm bg-accent-primary/70 transition-colors group-hover:bg-accent-primary" style={{ height: `${height}%` }} />
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <h3 className="mb-3 text-sm font-semibold text-text-primary">访问来源</h3>
              {analytics.topSources.length ? (
                <div className="space-y-2">
                  {analytics.topSources.slice(0, 6).map((item) => (
                    <div key={item.source} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-text-secondary" title={item.source}>{sourceLabel(item.source)}</span>
                      <strong className="shrink-0 text-text-primary">{item.visitors.toLocaleString('zh-CN')}</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-text-tertiary">新版本部署后开始记录来源。</p>}
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <h3 className="mb-3 text-sm font-semibold text-text-primary">热门页面</h3>
              <div className="space-y-2.5">
                {analytics.topPaths.slice(0, 6).map((item) => (
                  <div key={item.pathname} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate text-text-secondary" title={item.pathname}>{item.pathname}</span>
                    <strong className="text-text-primary">{item.views} PV</strong>
                    <span className="col-span-2 text-xs text-text-tertiary">
                      {item.visitors} 访客 · {item.engagedVisitors} 有效阅读 · {item.depth50Visitors}/{item.depth90Visitors} 读到 50%/90% · 平均 {item.averageEngagedSeconds} 秒
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border-default bg-bg-tertiary p-4">
              <h3 className="mb-3 text-sm font-semibold text-text-primary">主要落地页</h3>
              {analytics.topLandingPaths.length ? (
                <div className="space-y-2.5">
                  {analytics.topLandingPaths.slice(0, 6).map((item) => (
                    <div key={item.pathname} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-text-secondary" title={item.pathname}>{item.pathname}</span>
                      <strong className="shrink-0 text-text-primary">{item.visitors} 访客</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-text-tertiary">新版本部署后开始记录落地页。</p>}
            </div>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Post Form */}
        <form className="bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-4" onSubmit={handlePostSubmit}>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">发布文章</h2>
            <p className="text-xs text-text-tertiary">生成新的 MDX 文章并写入 content/posts。</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={postForm.title}
              onChange={(event) => setPostForm({ ...postForm, title: event.target.value })}
              placeholder="标题"
              className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
            />
            <input
              value={postForm.slug}
              onChange={(event) => setPostForm({ ...postForm, slug: event.target.value })}
              placeholder="Slug（可选）"
              className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
            />
            <input
              value={postForm.description}
              onChange={(event) => setPostForm({ ...postForm, description: event.target.value })}
              placeholder="一句话描述"
              className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md md:col-span-2"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="date"
              value={postForm.date}
              onChange={(event) => setPostForm({ ...postForm, date: event.target.value })}
              className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
            />
            <input
              value={postForm.tags}
              onChange={(event) => setPostForm({ ...postForm, tags: event.target.value })}
              placeholder="标签（逗号分隔）"
              className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
            />
            <select
              value={postForm.icon}
              onChange={(event) => setPostForm({ ...postForm, icon: event.target.value })}
              className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
            >
              <option value="robot">🤖 卖萌机器人</option>
              <option value="cat">🐱 高冷猫</option>
            </select>
          </div>
          <textarea
            value={postForm.content}
            onChange={(event) => setPostForm({ ...postForm, content: event.target.value })}
            rows={10}
            className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
          />
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary px-4 py-2 text-sm">
              保存文章
            </button>
            {postStatus && <span className="text-xs text-text-tertiary">{postStatus}</span>}
          </div>
        </form>

        <div className="space-y-6">
          {/* System Settings Form */}
          <form className="bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-4" onSubmit={handleSettingsSubmit}>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">系统配置</h2>
              <p className="text-xs text-text-tertiary">配置知识星球引流链接与全站 Slogan。</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
                <input
                    value={settingsForm.siteSlogan}
                    onChange={(e) => setSettingsForm({ ...settingsForm, siteSlogan: e.target.value })}
                    placeholder="站点 Slogan"
                    className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
                />
                <input
                    value={settingsForm.planetUrl}
                    onChange={(e) => setSettingsForm({ ...settingsForm, planetUrl: e.target.value })}
                    placeholder="知识星球跳转链接"
                    className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
                />
                <input
                    value={settingsForm.planetQrCode}
                    onChange={(e) => setSettingsForm({ ...settingsForm, planetQrCode: e.target.value })}
                    placeholder="星球二维码图片 URL"
                    className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
                />
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary px-4 py-2 text-sm">
                保存配置
              </button>
              {settingsStatus && <span className="text-xs text-text-tertiary">{settingsStatus}</span>}
            </div>
          </form>

          {/* Tool Form */}
          <form className="bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-4" onSubmit={handleToolSubmit}>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">发布工具</h2>
              <p className="text-xs text-text-tertiary">提交新的 GitHub 工具或交互式插件。</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                value={toolForm.name}
                onChange={(event) => setToolForm({ ...toolForm, name: event.target.value })}
                placeholder="工具名称"
                className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
                />
                <select
                    value={toolForm.type}
                    onChange={(event) => setToolForm({ ...toolForm, type: event.target.value as any })}
                    className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
                >
                    <option value="link">外部链接</option>
                    <option value="plugin">交互插件</option>
                </select>
            </div>
            
            <input
              value={toolForm.description}
              onChange={(event) => setToolForm({ ...toolForm, description: event.target.value })}
              placeholder="工具描述"
              className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
            />
            
            {toolForm.type === 'link' ? (
                <input
                    value={toolForm.url}
                    onChange={(event) => setToolForm({ ...toolForm, url: event.target.value })}
                    placeholder="GitHub 链接"
                    className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
                />
            ) : (
                <input
                    value={toolForm.pluginId}
                    onChange={(event) => setToolForm({ ...toolForm, pluginId: event.target.value })}
                    placeholder="插件 ID (如 prompt-generator)"
                    className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
                />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={toolForm.tags}
                onChange={(event) => setToolForm({ ...toolForm, tags: event.target.value })}
                placeholder="标签（逗号分隔）"
                className="w-full px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
              />
              <div className="flex items-center gap-4 px-3">
                <select
                    value={toolForm.status}
                    onChange={(event) => setToolForm({ ...toolForm, status: event.target.value })}
                    className="flex-1 px-3 py-2 text-sm bg-bg-tertiary text-text-primary border border-border-default rounded-md"
                >
                    <option value="Active">Active</option>
                    <option value="Beta">Beta</option>
                    <option value="Hot">Hot</option>
                    <option value="Pro">Pro</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                        type="checkbox"
                        checked={toolForm.isPro}
                        onChange={(e) => setToolForm({ ...toolForm, isPro: e.target.checked })}
                        className="h-4 w-4 rounded border-border-default bg-bg-tertiary text-accent-primary"
                    />
                    会员专属
                </label>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" className="btn-primary px-4 py-2 text-sm">
                保存工具
              </button>
              {toolStatus && <span className="text-xs text-text-tertiary">{toolStatus}</span>}
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

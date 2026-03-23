'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const defaultPostContent = `## 新文章\n\n用人话写清楚一个 AI 概念。\n\n<InfoCard type=\"robot\" title=\"核心观点\">\n  - 这里写要点\n</InfoCard>\n`

type AdminClientProps = {
  isAuthed: boolean
}

export default function AdminClient({ isAuthed }: AdminClientProps) {
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

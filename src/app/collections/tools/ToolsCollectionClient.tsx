'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ToolItem } from './types'
import PlanetBanner from '@/components/PlanetBanner'
import ToolPluginRegistry from '@/components/tools/ToolPluginRegistry'
import { SystemSettings } from '@/lib/admin-storage'

const tagTones = ['label-blue', 'label-green', 'label-purple', 'label-orange', 'label-red']

type TagOption = {
  tag: string
  count: number
}

export default function ToolsCollectionClient({ tools, settings }: { tools: ToolItem[], settings: SystemSettings }) {
  const router = useRouter()
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [activePluginId, setActivePluginId] = useState<string | null>(null)

  const tagOptions = useMemo<TagOption[]>(() => {
    const counts = tools.reduce((acc, tool) => {
      (tool.tags || []).forEach((tag) => {
        acc[tag] = (acc[tag] || 0) + 1
      })
      return acc
    }, {} as Record<string, number>)

    return Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        if (a.tag === b.tag) return 0
        return a.tag > b.tag ? 1 : -1
      })
  }, [tools])

  const filteredTools = useMemo(() => {
    if (!activeTag) return tools
    return tools.filter((tool) => (tool.tags || []).includes(activeTag))
  }, [activeTag, tools])

  const topThree = filteredTools.slice(0, 3)
  const rest = filteredTools.slice(3)
  const rankOffset = topThree.length

  const handleToolClick = (tool: ToolItem) => {
    // 1. 如果是交互插件
    if (tool.type === 'plugin' && tool.pluginId) {
        setActivePluginId(activePluginId === tool.pluginId ? null : tool.pluginId)
        if (activePluginId !== tool.pluginId) {
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    } 
    // 2. 如果是外部链接或普通跳转
    else {
        const targetUrl = tool.isPro ? '/planet' : tool.url
        if (targetUrl.startsWith('http')) {
            window.open(targetUrl, '_blank', 'noopener,noreferrer')
        } else {
            router.push(targetUrl)
        }
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
      <aside className="space-y-4 bg-bg-secondary border border-border-default rounded-xl p-4 lg:sticky lg:top-20 h-fit">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">标签筛选</h2>
          {activeTag && (
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              className="text-xs text-text-tertiary hover:text-text-primary"
            >
              清除
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
              activeTag === null
                ? 'border-accent-tertiary bg-accent-tertiary/10 text-text-primary'
                : 'border-border-default text-text-secondary hover:bg-bg-tertiary/60'
            }`}
          >
            <span>全部</span>
            <span className="text-xs text-text-tertiary">{tools.length}</span>
          </button>

          {tagOptions.map((option) => (
            <button
              key={option.tag}
              type="button"
              onClick={() => setActiveTag((current) => (current === option.tag ? null : option.tag))}
              className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                activeTag === option.tag
                  ? 'border-accent-tertiary bg-accent-tertiary/10 text-text-primary'
                  : 'border-border-default text-text-secondary hover:bg-bg-tertiary/60'
              }`}
            >
              <span className="truncate">{option.tag}</span>
              <span className="text-xs text-text-tertiary">{option.count}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="space-y-6">
        {/* Active Plugin Area */}
        {activePluginId && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-accent-tertiary animate-pulse"></span>
                        交互体验中
                    </h2>
                    <button 
                        onClick={() => setActivePluginId(null)}
                        className="text-xs text-text-tertiary hover:text-accent-tertiary font-bold"
                    >
                        关闭插件 ✕
                    </button>
                </div>
                <ToolPluginRegistry pluginId={activePluginId} />
                <div className="h-px bg-border-default my-8"></div>
            </div>
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span>{filteredTools.length} 个结果</span>
          {activeTag && <span className="text-text-tertiary">|</span>}
          {activeTag && (
            <span className="inline-flex items-center gap-2 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
              {activeTag}
            </span>
          )}
        </div>

        {topThree.length > 0 ? (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {topThree.map((tool, index) => {
              const isPlugin = tool.type === 'plugin'
              const CardTag = isPlugin ? 'button' : 'a'
              const props = isPlugin 
                ? { onClick: () => handleToolClick(tool), type: 'button' as const } 
                : { href: tool.isPro ? '/planet' : tool.url, target: tool.isPro ? '_self' : '_blank', rel: 'noopener noreferrer' }

              return (
                <CardTag
                  key={tool.id}
                  {...props}
                  className={`relative text-left bg-bg-secondary border rounded-2xl p-5 flex flex-col gap-4 hover:border-accent-tertiary hover:shadow-lg transition-all group overflow-hidden ${
                    activePluginId === tool.pluginId ? 'border-accent-tertiary ring-2 ring-accent-tertiary/20' : 'border-border-default'
                  }`}
                >
                  {tool.isPro && (
                    <div className="absolute top-0 right-0 px-3 py-1 bg-accent-tertiary text-white text-[10px] font-bold rounded-bl-xl z-10">
                      PRO
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-text-tertiary">
                    <span className="uppercase tracking-widest">Rank #{index + 1}</span>
                    <span className="text-base">{isPlugin ? '⚡' : (tool.isPro ? '🔒' : '🔧')}</span>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-text-primary group-hover:text-accent-tertiary transition-colors">
                      {tool.name}
                    </h2>
                    <p className="text-sm text-text-secondary line-clamp-2">{tool.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    {(tool.tags || []).slice(0, 3).map((tag, tagIndex) => (
                      <span key={tag} className={`label ${tagTones[tagIndex % tagTones.length]}`}>
                        {tag}
                      </span>
                    ))}
                    {tool.status && <span className="label label-gray">{tool.status}</span>}
                  </div>
                  <span className="text-xs text-accent-tertiary font-bold group-hover:underline">
                      {isPlugin ? (activePluginId === tool.pluginId ? '正在运行...' : '立即试用 →') : (tool.isPro ? '点击解锁会员版 →' : '前往 GitHub →')}
                  </span>
                </CardTag>
              )
            })}
          </div>
        ) : (
          <div className="blankslate">
            <div className="blankslate-icon">🔧</div>
            <h3 className="blankslate-heading">暂无工具</h3>
            <p className="blankslate-description">
              {activeTag ? '没有匹配的工具，试试切换标签。' : '后续会逐步补充。'}
            </p>
          </div>
        )}

        {/* Lead Gen Banner */}
        <PlanetBanner 
            title="需要更硬核的 AI 实战工具？" 
            description="加入知识星球，获取 Pro 版工具完整源码、配套教程，以及作者 1对1 部署支持。" 
            planetUrl={settings.planetUrl}
            planetQrCode={settings.planetQrCode}
        />

        {rest.length > 0 && (
          <div className="bg-bg-secondary border border-border-default rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">工具清单</h2>
              <span className="text-xs text-text-tertiary">持续更新</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-text-tertiary border-b border-border-default">
                    <th className="py-2 pr-4">Rank</th>
                    <th className="py-2 pr-4">工具</th>
                    <th className="py-2 pr-4">标签</th>
                    <th className="py-2 pr-4">状态</th>
                    <th className="py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rest.map((tool, index) => (
                    <tr
                      key={tool.id}
                      className="border-b border-border-default last:border-b-0 hover:bg-bg-tertiary/50 transition-colors"
                    >
                      <td className="py-3 pr-4 text-text-secondary">#{index + rankOffset + 1}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-bg-tertiary border border-border-default flex items-center justify-center">
                            {tool.type === 'plugin' ? '⚡' : (tool.isPro ? '🔒' : '🔧')}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-text-primary truncate flex items-center gap-2">
                                {tool.name}
                                {tool.isPro && (
                                    <span className="px-1.5 py-0.5 bg-accent-tertiary/10 text-accent-tertiary text-[10px] font-bold rounded">PRO</span>
                                )}
                            </p>
                            <p className="text-xs text-text-secondary truncate">{tool.description}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">
                        {(tool.tags || []).slice(0, 2).map((tag, tagIndex) => (
                          <span key={tag} className={`label ${tagTones[tagIndex % tagTones.length]} mr-2`}>
                            {tag}
                          </span>
                        ))}
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">{tool.status || 'Active'}</td>
                      <td className="py-3">
                        <button
                          onClick={() => handleToolClick(tool)}
                          className="text-xs text-accent-tertiary font-bold"
                        >
                          {tool.type === 'plugin' ? (activePluginId === tool.pluginId ? '运行中' : '试用') : (tool.isPro ? '解锁' : '详情')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

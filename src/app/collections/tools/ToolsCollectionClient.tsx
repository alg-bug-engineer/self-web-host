'use client'

import { useMemo, useState } from 'react'
import type { ToolItem } from './types'

const tagTones = ['label-blue', 'label-green', 'label-purple', 'label-orange', 'label-red']

type TagOption = {
  tag: string
  count: number
}

export default function ToolsCollectionClient({ tools }: { tools: ToolItem[] }) {
  const [activeTag, setActiveTag] = useState<string | null>(null)

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
            {topThree.map((tool, index) => (
              <a
                key={tool.id}
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-bg-secondary border border-border-default rounded-2xl p-5 flex flex-col gap-4 hover:border-accent-tertiary hover:shadow-lg transition-all group"
              >
                <div className="flex items-center justify-between text-xs text-text-tertiary">
                  <span className="uppercase tracking-widest">Rank #{index + 1}</span>
                  <span className="text-base">🔧</span>
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
                <span className="text-xs text-accent-tertiary group-hover:underline">前往 GitHub →</span>
              </a>
            ))}
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
                            🔧
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-text-primary truncate">{tool.name}</p>
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
                        <a
                          href={tool.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent-tertiary"
                        >
                          GitHub →
                        </a>
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

import Link from 'next/link'
import fs from 'fs/promises'
import { toolsDataPath } from '@/lib/admin-storage'

export const metadata = {
  title: '工具合集 | 芝士AI吃鱼',
  description: '收集与自研的 AI 小工具清单。',
}

const tagTones = ['label-blue', 'label-green', 'label-purple', 'label-orange', 'label-red']

export const dynamic = 'force-dynamic'

type ToolItem = {
  id: string
  name: string
  description: string
  url: string
  tags: string[]
  status?: string
}

const loadTools = async (): Promise<ToolItem[]> => {
  try {
    const data = await fs.readFile(toolsDataPath, 'utf8')
    return JSON.parse(data) as ToolItem[]
  } catch {
    return []
  }
}

export default async function ToolsCollectionPage() {
  const tools = await loadTools()
  const topThree = tools.slice(0, 3)
  const rest = tools.slice(3)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">工具合集</h1>
        <p className="text-sm text-text-secondary">自己开发与收藏的 GitHub 小工具。</p>
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
          <p className="blankslate-description">后续会逐步补充。</p>
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
                    <td className="py-3 pr-4 text-text-secondary">#{index + 4}</td>
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
    </div>
  )
}

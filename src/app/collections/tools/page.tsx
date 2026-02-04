import fs from 'fs/promises'
import { toolsDataPath } from '@/lib/admin-storage'
import ToolsCollectionClient from './ToolsCollectionClient'
import type { ToolItem } from './types'

export const metadata = {
  title: '工具合集 | 芝士AI吃鱼',
  description: '收集与自研的 AI 小工具清单。',
}

export const dynamic = 'force-dynamic'

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">工具合集</h1>
        <p className="text-sm text-text-secondary">自己开发与收藏的 GitHub 小工具。</p>
      </div>

      <ToolsCollectionClient tools={tools} />
    </div>
  )
}

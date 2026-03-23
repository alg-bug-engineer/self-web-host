'use client'

import React from 'react'
import PromptGenerator from './PromptGenerator'

const plugins: Record<string, React.ComponentType> = {
  'prompt-generator': PromptGenerator,
}

export default function ToolPluginRegistry({ pluginId }: { pluginId: string }) {
  const PluginComponent = plugins[pluginId]

  if (!PluginComponent) {
    return (
      <div className="p-8 text-center bg-bg-secondary border border-border-default rounded-2xl">
        <p className="text-text-tertiary">插件 {pluginId} 正在开发中...</p>
      </div>
    )
  }

  return <PluginComponent />
}

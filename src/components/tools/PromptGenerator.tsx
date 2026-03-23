'use client'

import { useState } from 'react'

export default function PromptGenerator() {
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState('realistic')
  const [generatedPrompt, setGeneratedPrompt] = useState('')

  const handleGenerate = () => {
    if (!topic) return
    const styles: Record<string, string> = {
      realistic: 'highly detailed, 8k, photorealistic, cinematic lighting',
      anime: 'anime style, vibrant colors, clean lines, high quality',
      oil: 'oil painting, thick brushstrokes, classical masterpiece',
      cyberpunk: 'cyberpunk aesthetic, neon lights, futuristic, rainy night',
    }
    const prompt = `${topic}, ${styles[style] || ''}, masterpiece, trending on artstation`
    setGeneratedPrompt(prompt)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedPrompt)
    alert('已复制到剪贴板')
  }

  return (
    <div className="bg-bg-secondary border border-border-default rounded-2xl p-6 space-y-6">
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-text-primary">AI 绘画提示词生成器</h3>
        <p className="text-sm text-text-secondary">输入主题并选择风格，快速生成高质量生图 Prompt。</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">画面主题</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如: 一只在太空漫步的橘猫"
            className="w-full px-4 py-2 bg-bg-tertiary border border-border-default rounded-xl focus:ring-2 focus:ring-accent-tertiary outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-secondary">艺术风格</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {['realistic', 'anime', 'oil', 'cyberpunk'].map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`px-3 py-2 text-sm rounded-lg border transition-all ${
                  style === s 
                    ? 'bg-accent-tertiary border-accent-tertiary text-white font-bold' 
                    : 'bg-bg-tertiary border-border-default text-text-secondary hover:bg-bg-secondary'
                }`}
              >
                {s === 'realistic' && '写实'}
                {s === 'anime' && '动漫'}
                {s === 'oil' && '油画'}
                {s === 'cyberpunk' && '赛博'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleGenerate}
          className="w-full py-3 bg-accent-tertiary text-white font-bold rounded-xl hover:opacity-90 transition-opacity"
        >
          立即生成 Prompt
        </button>
      </div>

      {generatedPrompt && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
          <label className="text-sm font-medium text-text-secondary">生成结果</label>
          <div className="relative">
            <textarea
              readOnly
              value={generatedPrompt}
              className="w-full h-32 px-4 py-3 bg-bg-tertiary border border-border-default rounded-xl text-sm font-mono leading-relaxed"
            />
            <button
              onClick={copyToClipboard}
              className="absolute top-2 right-2 p-2 bg-bg-secondary border border-border-default rounded-lg hover:bg-bg-tertiary transition-colors"
              title="复制"
            >
              📋
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

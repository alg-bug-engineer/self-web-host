'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: '你好！我是 AI 助手，可以聊 AI、RAG、Agent，也可以帮你梳理学习路线。想从哪里开始？',
}

export default function AIChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)

  const canSend = input.trim().length > 0 && !isLoading

  const messageCount = useMemo(() => messages.length, [messages.length])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messageCount, isLoading])

  const sendMessage = async () => {
    if (!canSend) return
    const content = input.trim()
    setInput('')
    setError('')

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setIsLoading(true)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.message || '对话服务暂时不可用')
      }

      const assistantReply = String(payload?.message || '').trim()
      if (!assistantReply) {
        throw new Error('AI 没有返回内容，请稍后再试')
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: assistantReply }])
    } catch (err) {
      const message = err instanceof Error ? err.message : '对话失败，请稍后重试'
      setError(message)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '刚刚有点走神啦，能再说一遍吗？' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const handleClear = () => {
    setMessages([INITIAL_MESSAGE])
    setError('')
    setInput('')
  }

  return (
    <div className="rounded-2xl border border-border-default bg-bg-secondary p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">AI Assistant</h3>
          <p className="text-sm text-text-secondary">
            由 OpenRouter 免费模型驱动（stepfun/step-3.5-flash），可以直接提问与讨论。
          </p>
        </div>
        <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={handleClear}>
          清空对话
        </button>
      </div>

      <div
        ref={listRef}
        className="mt-4 max-h-[360px] space-y-3 overflow-y-auto rounded-xl border border-border-default bg-bg-tertiary/60 p-4"
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                message.role === 'user'
                  ? 'bg-accent-primary/20 text-text-primary border border-border-default'
                  : 'bg-bg-secondary text-text-secondary border border-border-default'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border-default bg-bg-secondary px-4 py-3 text-sm text-text-tertiary">
              AI 正在思考中...
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-border-default bg-color-danger-subtle px-4 py-2 text-sm text-color-danger-fg">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <textarea
          className="w-full min-h-[96px] resize-none rounded-xl border border-border-default bg-bg-tertiary px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/40"
          placeholder="输入你的问题，按 Enter 发送，Shift+Enter 换行。"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-tertiary">
            提示：可以问「如何快速理解 RAG？」或「帮我规划 30 天学习路线」。
          </p>
          <button
            type="button"
            className="btn-primary px-5 py-2 text-sm"
            onClick={sendMessage}
            disabled={!canSend}
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

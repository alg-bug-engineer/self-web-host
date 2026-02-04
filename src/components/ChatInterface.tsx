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

export default function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const canSend = input.trim().length > 0 && !isLoading

  const messageCount = useMemo(() => messages.length, [messages.length])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
    if (inputRef.current && !isLoading) {
      inputRef.current.focus()
    }
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

  return (
    <div className="flex flex-col h-full">
      <header className="p-4 border-b border-border-default">
        <h1 className="text-xl font-semibold text-text-primary">AI 助手</h1>
        <p className="text-sm text-text-secondary">由 OpenRouter 免费模型驱动，每次刷新都是新的对话。</p>
      </header>
      
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-bg-tertiary flex items-center justify-center text-lg">🤖</div>
            )}
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                message.role === 'user'
                  ? 'bg-accent-primary/20 text-text-primary border border-border-default'
                  : 'bg-bg-secondary text-text-secondary border border-border-default'
              }`}
            >
              {message.content}
            </div>
             {message.role === 'user' && (
                <div className="w-8 h-8 flex-shrink-0 rounded-full bg-bg-tertiary flex items-center justify-center text-lg">🐱</div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start gap-3 justify-start">
            <div className="w-8 h-8 flex-shrink-0 rounded-full bg-bg-tertiary flex items-center justify-center text-lg">🤖</div>
            <div className="rounded-2xl border border-border-default bg-bg-secondary px-4 py-3 text-sm text-text-tertiary">
              AI 正在思考中...
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border-default">
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="mb-3 rounded-xl border border-border-default bg-color-danger-subtle px-4 py-2 text-sm text-color-danger-fg">
              {error}
            </div>
          )}
          <div className="relative">
            <textarea
              ref={inputRef}
              className="w-full min-h-[52px] max-h-48 resize-none rounded-xl border border-border-default bg-bg-tertiary pl-4 pr-20 py-3.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/40"
              placeholder="输入你的问题..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 btn-primary px-4 py-2 text-sm rounded-lg"
              onClick={sendMessage}
              disabled={!canSend}
            >
              发送
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-text-tertiary">
            按 Enter 发送，Shift+Enter 换行。
          </p>
        </div>
      </div>
    </div>
  )
}

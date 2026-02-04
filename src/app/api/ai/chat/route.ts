import { NextResponse } from 'next/server'
import { ProxyAgent, fetch as undiciFetch } from 'undici'

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL_NAME = 'z-ai/glm-4.5-air:free'

type IncomingMessage = {
  role?: string
  content?: string
}

function getProxyUrl(): string | undefined {
  return process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY || process.env.all_proxy || process.env.ALL_PROXY
}

export async function POST(request: Request) {
  console.log('[AI Chat] 收到请求')

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('[AI Chat] 环境变量 OPENROUTER_API_KEY 未设置')
    return NextResponse.json({ ok: false, message: '未配置 OpenRouter Key' }, { status: 500 })
  }
  console.log('[AI Chat] API Key 已加载, 长度:', apiKey.length)

  const body = await request.json().catch((err) => {
    console.error('[AI Chat] 解析请求体失败:', err)
    return null
  })

  const messages = Array.isArray(body?.messages) ? (body.messages as IncomingMessage[]) : []

  const sanitizedMessages = messages
    .map((message) => ({
      role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
      content: String(message.content || '').trim(),
    }))
    .filter((message) => message.content.length > 0)

  if (!sanitizedMessages.length) {
    return NextResponse.json({ ok: false, message: '缺少对话内容' }, { status: 400 })
  }

  const payload = {
    model: MODEL_NAME,
    messages: [
      {
        role: 'system',
        content:
          '你是芝士AI吃鱼的 AI 助手，擅长用通俗有趣的方式解释 AI、RAG、Agent 与学习路线。回答简洁、有条理，必要时给出步骤。',
      },
      ...sanitizedMessages,
    ],
    temperature: 0.7,
  }

  const proxyUrl = getProxyUrl()
  console.log('[AI Chat] 发送请求到 OpenRouter, 模型:', MODEL_NAME, ', 代理:', proxyUrl || '无')

  try {
    const fetchOptions: any = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': request.headers.get('origin') || 'https://localhost',
        'X-Title': 'CheeseAI',
      },
      body: JSON.stringify(payload),
    }

    if (proxyUrl) {
      fetchOptions.dispatcher = new ProxyAgent(proxyUrl)
    }

    const response = await undiciFetch(OPENROUTER_ENDPOINT, fetchOptions)

    console.log('[AI Chat] OpenRouter 响应状态:', response.status, response.statusText)

    const rawText = await response.text()
    console.log('[AI Chat] OpenRouter 原始响应:', rawText.slice(0, 500))

    let data: any = null
    try {
      data = JSON.parse(rawText)
    } catch {
      console.error('[AI Chat] 解析 OpenRouter 响应 JSON 失败')
      return NextResponse.json({ ok: false, message: 'OpenRouter 返回了无效的响应' }, { status: 502 })
    }

    if (!response.ok) {
      console.error('[AI Chat] OpenRouter 返回错误:', JSON.stringify(data, null, 2))
      return NextResponse.json(
        { ok: false, message: data?.error?.message || 'OpenRouter 请求失败' },
        { status: response.status },
      )
    }

    const content = String(data?.choices?.[0]?.message?.content || '').trim()
    console.log('[AI Chat] AI 回复内容长度:', content.length)

    if (!content) {
      console.error('[AI Chat] AI 未返回内容, 完整响应:', JSON.stringify(data, null, 2))
      return NextResponse.json({ ok: false, message: 'AI 未返回内容' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, message: content })
  } catch (error) {
    console.error('[AI Chat] 请求异常:', (error as any)?.message)
    if ((error as any)?.cause) {
      console.error('[AI Chat] 异常原因 (cause):', (error as any).cause)
    }
    return NextResponse.json({ ok: false, message: '服务暂时不可用' }, { status: 500 })
  }
}

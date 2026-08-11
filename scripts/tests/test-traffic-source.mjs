#!/usr/bin/env node

import assert from 'node:assert/strict'
import { classifyTrafficSource } from '../../src/lib/traffic-source.mjs'

const cases = [
  [{}, 'direct'],
  [{ referrer: 'not a url' }, 'direct'],
  [{ referrer: 'https://ai-knowledgepoints.cn/blog/article' }, 'internal'],
  [{ referrer: 'https://docs.ai-knowledgepoints.cn/page' }, 'internal'],
  [{ referrer: 'https://chatgpt.com/c/abc' }, 'ai:chatgpt'],
  [{ referrer: 'https://chat.openai.com/c/legacy' }, 'ai:chatgpt'],
  [{ referrer: 'https://www.perplexity.ai/search/example' }, 'ai:perplexity'],
  [{ referrer: 'https://claude.ai/chat/example' }, 'ai:claude'],
  [{ referrer: 'https://gemini.google.com/app/example' }, 'ai:gemini'],
  [{ referrer: 'https://copilot.microsoft.com/chats/example' }, 'ai:copilot'],
  [{ referrer: 'https://chat.deepseek.com/a/chat/s/example' }, 'ai:deepseek'],
  [{ referrer: 'https://www.kimi.com/chat/example' }, 'ai:kimi'],
  [{ referrer: 'https://www.doubao.com/chat/example' }, 'ai:doubao'],
  [{ referrer: 'https://yuanbao.tencent.com/chat/example' }, 'ai:yuanbao'],
  [{ referrer: 'https://www.google.com/search?q=ai' }, 'search:google'],
  [{ referrer: 'https://www.baidu.com/s?wd=ai' }, 'search:baidu'],
  [{ referrer: 'https://mp.weixin.qq.com/s/example' }, 'social:wechat'],
  [{ referrer: 'https://example.com/article' }, 'referral:example.com'],
  [{ referrer: 'https://chatgpt.com.example.org/' }, 'referral:chatgpt.com.example.org'],
  [{ referrer: 'https://gemini.google.com/', utmSource: 'AI Newsletter', utmMedium: 'E-mail' }, 'campaign:ai-newsletter/e-mail'],
]

for (const [input, expected] of cases) {
  assert.equal(classifyTrafficSource(input), expected, JSON.stringify(input))
}

console.log('流量来源分类测试通过：AI 助手、搜索、社交、UTM 优先级与仿冒域名边界均正确。')

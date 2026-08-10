#!/usr/bin/env node

import assert from 'node:assert/strict'
import { cleanMdxForLlms, renderPostMarkdown } from '../../src/lib/llms-markdown.mjs'

const sample = `正文开头。

<InfoCard type="robot" title="核心观点">
保留卡片里的内容。
</InfoCard>

<TwoColumnLayout>
<Left>
左侧内容。
</Left>
<Right>
右侧内容。
</Right>
</TwoColumnLayout>

![示意图](/images/example.png)

\`\`\`tsx
<InfoCard title="代码示例必须保留" />
\`\`\`
`

const cleaned = cleanMdxForLlms(sample, 'https://ai-knowledgepoints.cn')
assert.match(cleaned, /### 核心观点/)
assert.match(cleaned, /保留卡片里的内容/)
assert.match(cleaned, /左侧内容/)
assert.match(cleaned, /右侧内容/)
assert.match(cleaned, /https:\/\/ai-knowledgepoints\.cn\/images\/example\.png/)
assert.match(cleaned, /<InfoCard title="代码示例必须保留" \/>/)
assert.doesNotMatch(cleaned, /<TwoColumnLayout>|<Left>|<Right>|<\/InfoCard>/)

const markdown = renderPostMarkdown({
  title: '测试文章',
  description: '用于验证机器可读正文。',
  date: '2026-08-11T08:30:00+08:00',
  author: '芝士AI吃鱼',
  tags: ['GEO', 'AI'],
  url: '/blog/test-post',
  body: { raw: sample },
}, 'https://ai-knowledgepoints.cn')

assert.match(markdown, /^# 测试文章/m)
assert.match(markdown, /> 用于验证机器可读正文。/)
assert.match(markdown, /发布日期：2026-08-11/)
assert.match(markdown, /主题：GEO、AI/)
assert.match(markdown, /https:\/\/ai-knowledgepoints\.cn\/blog\/test-post\/index\.html\.md/)
assert.match(markdown, /## 正文/)

console.log('GEO Markdown 转换测试通过：元数据、MDX 清理、绝对资源地址和代码块均可解释。')

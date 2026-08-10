#!/usr/bin/env node

import assert from 'node:assert/strict'
import { extractArticleHeadings } from '../../src/lib/article-headings.mjs'

const headings = extractArticleHeadings(`# 页面标题

## 第一章：理解 **AI**

### 细节不会进入目录

## [第二章](https://example.com)：继续理解

\`\`\`md
## 代码块里的伪标题
\`\`\`

## 第一章：理解 AI
`)

assert.deepEqual(headings, [
  { id: '第一章理解-ai', text: '第一章：理解 AI', level: 2 },
  { id: '第二章继续理解', text: '第二章：继续理解', level: 2 },
  { id: '第一章理解-ai-1', text: '第一章：理解 AI', level: 2 },
])

console.log('文章目录提取测试通过：标题文本、重复 ID 与代码块排除均和渲染规则一致。')

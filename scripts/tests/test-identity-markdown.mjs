#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { renderAboutMarkdown, renderPortfolioMarkdown } from '../../src/lib/identity-markdown.mjs'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const profile = JSON.parse(await fs.readFile(path.join(projectDir, 'src/data/profile.json'), 'utf8'))
const portfolio = JSON.parse(await fs.readFile(path.join(projectDir, 'content/collections/portfolio.json'), 'utf8'))

assert.equal(profile.version, 2)
assert.deepEqual(profile.publicIdentity.career.employers, ['阿里', '百度', '滴滴', '浪潮'])
assert.match(profile.publicIdentity.career.sourceUrl, /^https:\/\//)
assert.equal(profile.verifiedWorks[0].identifier, 'CN118861081B')
assert.match(profile.verifiedWorks[0].url, /^https:\/\/patents\.google\.com\//)

const about = renderAboutMarkdown(profile, portfolio, {
  authorName: '张其来',
  brandName: '芝士AI吃鱼',
  canonical: 'https://ai-knowledgepoints.cn/about',
  markdownUrl: 'https://ai-knowledgepoints.cn/about/index.html.md',
  profileUrls: ['https://github.com/alg-bug-engineer'],
})
assert.match(about, /^# 张其来（芝士AI吃鱼）/m)
assert.match(about, /阿里、百度、滴滴、浪潮/)
assert.match(about, /CN118861081B/)
assert.match(about, /公开记录：\[国家知识产权局公开专利文本 \/ Google Patents\]/)
assert.match(about, /https:\/\/ai-knowledgepoints\.cn\/about\/index\.html\.md/)

const works = renderPortfolioMarkdown(portfolio, {
  authorName: '张其来',
  brandName: '芝士AI吃鱼',
  canonical: 'https://ai-knowledgepoints.cn/portfolio',
  markdownUrl: 'https://ai-knowledgepoints.cn/portfolio/index.html.md',
})
assert.match(works, /ISBN：9787115668981/)
assert.match(works, /ISBN：9787115689856/)
assert.match(works, /## 产品与开源项目/)

console.log('身份 GEO Markdown 测试通过：公开来源、专业成果、ISBN 与 canonical 均可机器核验。')

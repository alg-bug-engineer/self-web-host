#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { renderAboutMarkdown, renderPortfolioMarkdown } from '../../src/lib/identity-markdown.mjs'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const profile = JSON.parse(await fs.readFile(path.join(projectDir, 'src/data/profile.json'), 'utf8'))
const portfolio = JSON.parse(await fs.readFile(path.join(projectDir, 'content/collections/portfolio.json'), 'utf8'))
const privateName = String.fromCodePoint(0x5f20, 0x5176, 0x6765)
const bookTitles = portfolio.filter((item) => item.type === 'book').map((item) => item.title)

assert.equal(profile.version, 2)
assert.deepEqual(profile.publicIdentity.career.employers, ['阿里', '百度', '滴滴', '浪潮'])
assert.equal(profile.publicIdentity.career.sourceLabel, '公开职业资料交叉核验')
assert.equal(profile.verifiedWorks[0].identifier, 'CN118861081B')
assert.match(profile.verifiedWorks[0].url, /^https:\/\/patents\.google\.com\//)

const about = renderAboutMarkdown(profile, portfolio, {
  brandName: '芝士AI吃鱼',
  canonical: 'https://ai-knowledgepoints.cn/about',
  markdownUrl: 'https://ai-knowledgepoints.cn/about/index.html.md',
  profileUrls: ['https://github.com/alg-bug-engineer'],
})
assert.match(about, /^# 芝士AI吃鱼$/m)
assert.match(about, /阿里、百度、滴滴、浪潮/)
assert.match(about, /CN118861081B/)
assert.match(about, /公开记录：\[国家知识产权局公开专利文本 \/ Google Patents\]/)
assert.match(about, /https:\/\/ai-knowledgepoints\.cn\/about\/index\.html\.md/)
assert.ok(!about.includes(privateName))
for (const title of bookTitles) assert.ok(about.includes(`《${title}》`))

const works = renderPortfolioMarkdown(portfolio, {
  brandName: '芝士AI吃鱼',
  canonical: 'https://ai-knowledgepoints.cn/portfolio',
  markdownUrl: 'https://ai-knowledgepoints.cn/portfolio/index.html.md',
})
assert.match(works, /## 产品与开源项目/)
assert.ok(!works.includes(privateName))
const booksSection = works.match(/## 著作\n\n([\s\S]*?)\n\n## 产品与开源项目/)?.[1] || ''
assert.deepEqual(booksSection.split('\n'), bookTitles.map((title) => `- 《${title}》`))

console.log('身份 GEO Markdown 测试通过：个人姓名未公开，著作区域仅保留书名。')

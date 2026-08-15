#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const appDir = path.join(projectDir, '.next/server/app')
const aboutHtml = await fs.readFile(path.join(appDir, 'about.html'), 'utf8')
const portfolioHtml = await fs.readFile(path.join(appDir, 'portfolio.html'), 'utf8')
const llms = await fs.readFile(path.join(appDir, 'llms.txt.body'), 'utf8')
const privateName = String.fromCodePoint(0x5f20, 0x5176, 0x6765)
const portfolio = JSON.parse(await fs.readFile(path.join(projectDir, 'content/collections/portfolio.json'), 'utf8'))
const bookTitles = portfolio.filter((item) => item.type === 'book').map((item) => item.title)

const jsonLdBlocks = (html) => [...html.matchAll(
  /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
)].map((match) => JSON.parse(match[1]))

const aboutGraph = jsonLdBlocks(aboutHtml)
  .map((block) => block['@graph'])
  .find((graph) => Array.isArray(graph) && graph.some((item) => item['@type'] === 'ProfilePage'))
assert.ok(aboutGraph, '关于页缺少 JSON-LD graph')
assert.ok(aboutGraph.some((item) => item['@type'] === 'Person' && item.name === '芝士AI吃鱼'))
assert.ok(aboutGraph.some((item) => item['@type'] === 'CreativeWork' && item.identifier === 'CN118861081B'))
assert.match(aboutHtml, /type="text\/markdown"[^>]+href="https:\/\/ai-knowledgepoints\.cn\/about\/index\.html\.md"/)

const portfolioJsonLd = jsonLdBlocks(portfolioHtml).find((block) => block['@type'] === 'CollectionPage')
assert.ok(portfolioJsonLd, '作品页缺少 CollectionPage JSON-LD')
const books = portfolioJsonLd.hasPart.filter((item) => item['@type'] === 'Book')
assert.deepEqual(books.map((item) => item.name), bookTitles)
for (const book of books) assert.deepEqual(Object.keys(book).sort(), ['@type', 'name', 'url'])
assert.match(portfolioHtml, /type="text\/markdown"[^>]+href="https:\/\/ai-knowledgepoints\.cn\/portfolio\/index\.html\.md"/)

for (const [name, canonical, required] of [
  ['about', 'https://ai-knowledgepoints.cn/about', ['CN118861081B', '核验说明']],
  ['portfolio', 'https://ai-knowledgepoints.cn/portfolio', bookTitles],
]) {
  const routeDir = path.join(appDir, name)
  const body = await fs.readFile(path.join(routeDir, 'index.html.md.body'), 'utf8')
  const meta = JSON.parse(await fs.readFile(path.join(routeDir, 'index.html.md.meta'), 'utf8'))
  assert.match(meta.headers['content-type'], /text\/markdown/)
  assert.match(meta.headers.link, new RegExp(`<${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>; rel="canonical"`))
  for (const token of required) assert.ok(body.includes(token), `${name} Markdown 缺少 ${token}`)
  assert.ok(!body.includes(privateName), `${name} Markdown 泄露个人姓名`)
  assert.ok(llms.includes(`${canonical}/index.html.md`), `llms.txt 未引用 ${name} Markdown`)
}

for (const output of [aboutHtml, portfolioHtml, llms]) assert.ok(!output.includes(privateName))

console.log('身份 GEO 构建测试通过：页面与机器可读输出未公开个人姓名，著作仅保留书名。')

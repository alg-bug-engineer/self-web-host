#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const appDir = path.join(projectDir, '.next/server/app')
const aboutHtml = await fs.readFile(path.join(appDir, 'about.html'), 'utf8')
const portfolioHtml = await fs.readFile(path.join(appDir, 'portfolio.html'), 'utf8')
const llms = await fs.readFile(path.join(appDir, 'llms.txt.body'), 'utf8')

const jsonLdBlocks = (html) => [...html.matchAll(
  /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
)].map((match) => JSON.parse(match[1]))

const aboutGraph = jsonLdBlocks(aboutHtml)
  .map((block) => block['@graph'])
  .find((graph) => Array.isArray(graph) && graph.some((item) => item['@type'] === 'ProfilePage'))
assert.ok(aboutGraph, '关于页缺少 JSON-LD graph')
assert.ok(aboutGraph.some((item) => item['@type'] === 'Person' && item.name === '张其来'))
assert.ok(aboutGraph.some((item) => item['@type'] === 'CreativeWork' && item.identifier === 'CN118861081B'))
assert.match(aboutHtml, /type="text\/markdown"[^>]+href="https:\/\/ai-knowledgepoints\.cn\/about\/index\.html\.md"/)

const portfolioJsonLd = jsonLdBlocks(portfolioHtml).find((block) => block['@type'] === 'CollectionPage')
assert.ok(portfolioJsonLd, '作品页缺少 CollectionPage JSON-LD')
const books = portfolioJsonLd.hasPart.filter((item) => item['@type'] === 'Book')
assert.ok(books.some((item) => item.isbn === '9787115668981'))
assert.ok(books.some((item) => item.isbn === '9787115689856'))
assert.match(portfolioHtml, /type="text\/markdown"[^>]+href="https:\/\/ai-knowledgepoints\.cn\/portfolio\/index\.html\.md"/)

for (const [name, canonical, required] of [
  ['about', 'https://ai-knowledgepoints.cn/about', ['CN118861081B', '公开来源']],
  ['portfolio', 'https://ai-knowledgepoints.cn/portfolio', ['9787115668981', '9787115689856']],
]) {
  const routeDir = path.join(appDir, name)
  const body = await fs.readFile(path.join(routeDir, 'index.html.md.body'), 'utf8')
  const meta = JSON.parse(await fs.readFile(path.join(routeDir, 'index.html.md.meta'), 'utf8'))
  assert.match(meta.headers['content-type'], /text\/markdown/)
  assert.match(meta.headers.link, new RegExp(`<${canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>; rel="canonical"`))
  for (const token of required) assert.ok(body.includes(token), `${name} Markdown 缺少 ${token}`)
  assert.ok(llms.includes(`${canonical}/index.html.md`), `llms.txt 未引用 ${name} Markdown`)
}

console.log('身份 GEO 构建测试通过：可见页面、JSON-LD、Markdown 与 llms.txt 同源。')

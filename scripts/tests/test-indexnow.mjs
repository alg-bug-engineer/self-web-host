#!/usr/bin/env node

import assert from 'node:assert/strict'
import path from 'node:path'
import {
  buildIndexNowPayload,
  changedFilesBetween,
  chunkUrls,
  loadIndexNowConfig,
  loadPublishedPostPaths,
  mapChangedFilesToUrls,
  urlsFromSitemap,
} from '../lib/indexnow.mjs'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const config = await loadIndexNowConfig(projectDir)
const publishedPostPaths = await loadPublishedPostPaths(projectDir)
assert.ok(publishedPostPaths.length >= 1, 'IndexNow 没有读取到已发布文章')

const articleChange = mapChangedFilesToUrls([
  'content/posts/daily-2026-08-12-product-workflow.mdx',
  'src/app/about/page.tsx',
  'src/app/search/page.tsx',
  'src/app/admin/page.tsx',
], { siteUrl: config.siteUrl, publishedPostPaths })
assert.deepEqual(articleChange.urls, [
  'https://ai-knowledgepoints.cn/about',
  'https://ai-knowledgepoints.cn/blog',
  'https://ai-knowledgepoints.cn/blog/daily-2026-08-12-product-workflow',
])
assert.equal(articleChange.needsFullSitemap, false)

const templateChange = mapChangedFilesToUrls([
  'src/app/blog/[slug]/page.tsx',
], { siteUrl: config.siteUrl, publishedPostPaths })
assert.equal(templateChange.urls.length, publishedPostPaths.length + 1)
assert.ok(templateChange.urls.includes('https://ai-knowledgepoints.cn/blog'))

const globalChange = mapChangedFilesToUrls([
  'src/app/layout.tsx',
], { siteUrl: config.siteUrl, publishedPostPaths })
assert.equal(globalChange.needsFullSitemap, true)

const sitemapUrls = urlsFromSitemap(`<?xml version="1.0"?><urlset>
  <url><loc>https://ai-knowledgepoints.cn/</loc></url>
  <url><loc>https://ai-knowledgepoints.cn/blog/example</loc></url>
  <url><loc>https://example.com/not-ours</loc></url>
</urlset>`, config.siteUrl)
assert.deepEqual(sitemapUrls, [
  'https://ai-knowledgepoints.cn/',
  'https://ai-knowledgepoints.cn/blog/example',
])

const payload = buildIndexNowPayload(config, [...articleChange.urls, articleChange.urls[0]])
assert.equal(payload.host, 'ai-knowledgepoints.cn')
assert.equal(payload.keyLocation, `https://ai-knowledgepoints.cn/${config.keyFile}`)
assert.equal(payload.urlList.length, articleChange.urls.length)
assert.throws(
  () => buildIndexNowPayload(config, ['https://example.com/wrong-host']),
  /不属于本站/,
)
assert.deepEqual(chunkUrls(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'b'], ['c', 'd'], ['e']])
assert.deepEqual(
  await changedFilesBetween(projectDir, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),
  [],
  '浅克隆或缺失提交必须回退全量通知，而不是让部署后的通知步骤崩溃',
)

console.log(`IndexNow 增量映射测试通过：${publishedPostPaths.length} 篇已发布文章，验证文件 ${config.keyFile}。`)

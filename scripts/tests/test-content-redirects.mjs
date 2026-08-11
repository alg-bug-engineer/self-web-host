import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { compareArticleCandidate, parseArticle } from '../lib/content-diversity.mjs'
import { renderCoverSvg } from '../lib/article-visuals.mjs'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const oldSlug = 'daily-2026-08-11-ai-native-generation-learning-ability'
const replacementSlug = 'daily-2026-08-11-engineering-human-override-design'
const oldPost = parseArticle(
  await fs.readFile(path.join(projectDir, 'content', 'posts', `${oldSlug}.mdx`), 'utf8'),
  `${oldSlug}.mdx`,
)
const replacementPost = parseArticle(
  await fs.readFile(path.join(projectDir, 'content', 'posts', `${replacementSlug}.mdx`), 'utf8'),
  `${replacementSlug}.mdx`,
)
const replacementWechat = await fs.readFile(
  path.join(projectDir, 'content', 'wechat', `${replacementSlug}.html`),
  'utf8',
)
const redirectPolicy = JSON.parse(await fs.readFile(path.join(projectDir, 'ops', 'content-redirects.json'), 'utf8'))
const nextConfig = await fs.readFile(path.join(projectDir, 'next.config.js'), 'utf8')
const replacementManifest = JSON.parse(await fs.readFile(
  path.join(projectDir, 'content', 'wechat', `${replacementSlug}.json`),
  'utf8',
))

assert.equal(oldPost.published, false, '重复旧稿必须退出公开文章集合')
assert.equal(replacementPost.published, true, '替代稿必须保持公开')
assert.equal(replacementPost.topicId, 'engineering-human-override')
assert.equal(replacementPost.topicCluster, 'engineering')
assert.match(replacementPost.body, /模型参与流程后，一些任务变快了/)
assert.match(replacementWechat, /模型参与流程后，一些任务变快了/)
assert.match(replacementWechat, /自动化出了问题以后有没有恢复空间/)
assert.doesNotMatch(replacementPost.body, /How people are using ChatGPT/)
assert.doesNotMatch(replacementWechat, /How people are using ChatGPT/)

const coverSvg = renderCoverSvg({ title: replacementManifest.title, kicker: replacementManifest.topicCluster.toUpperCase() })
const titleLines = [...coverSvg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((match) => match[1])
assert.equal(titleLines.length, 2, '长封面标题应均衡分成两行')
assert.ok(titleLines.every((line) => [...line].length > 1), '封面标题不得出现单字孤行')
const cover = await fs.readFile(path.join(projectDir, replacementManifest.coverPath))
assert.equal(cover.subarray(1, 4).toString('ascii'), 'PNG', '替代稿封面必须是有效 PNG')

const comparison = compareArticleCandidate(
  { ...replacementPost, markdown: replacementPost.body },
  [oldPost],
)
assert.equal(comparison?.reasons?.length || 0, 0, `替代稿仍与旧稿冲突：${comparison?.reasons?.join('；')}`)

const redirect = redirectPolicy.redirects.find((item) => item.source === `/blog/${oldSlug}`)
assert.deepEqual(
  redirect && { destination: redirect.destination, permanent: redirect.permanent },
  { destination: `/blog/${replacementSlug}`, permanent: true },
  '旧地址必须永久重定向到替代文章',
)
assert.match(nextConfig, /content-redirects\.json/)
assert.match(nextConfig, /async redirects\(\)/)

console.log('历史重复文章修复测试通过：旧稿退出公开集合，旧 URL 永久指向差异化替代稿。')

#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const postsDir = path.join(projectDir, 'content', 'posts')
const groupUrl = 'https://wx.zsxq.com/group/28882182852411'
const expected = new Map([
  ['proton-mail-claude-tutorial', '45548821411144448'],
  ['claude2api-ide-tutorial', '82258841852128112'],
  ['cc-switch-introduction-install-guide', '45548821842558588'],
  ['chatgpt2api-install-guide', '22258841888821441'],
  ['sub2api-account-management', '22258841888158251'],
  ['claude-code-kimi-qwen-glm-guide', '45548821885852448'],
  ['jimeng-api-local-image-generation-guide', '22258841882454481'],
  ['claude-code-freedom-content-factory', '45548821885152188'],
])

function frontmatterValue(frontmatter, name) {
  return frontmatter.match(new RegExp(`^${name}:\\s*["']?([^"'\\n]+)["']?\\s*$`, 'm'))?.[1]?.trim()
}

function frontmatterList(frontmatter, name) {
  const block = frontmatter.match(new RegExp(`^${name}:\\s*\\n((?:\\s+- .+\\n?)+)`, 'm'))?.[1] || ''
  return [...block.matchAll(/^\s+-\s+(.+)$/gm)].map((match) => match[1].trim())
}

const files = (await fs.readdir(postsDir)).filter((file) => file.endsWith('.mdx'))
const previews = []

for (const file of files) {
  const source = await fs.readFile(path.join(postsDir, file), 'utf8')
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  assert.ok(match, `${file} 缺少有效 frontmatter`)
  if (frontmatterValue(match[1], 'access') !== 'planet-preview') continue
  previews.push({ file, slug: file.replace(/\.mdx$/, ''), frontmatter: match[1], body: match[2] })
}

assert.equal(previews.length, expected.size, 'planet-preview 文章数量必须为 8')
assert.equal(new Set(previews.map((post) => post.slug)).size, expected.size, '预览文章 slug 必须唯一')

for (const post of previews) {
  const topicId = expected.get(post.slug)
  assert.ok(topicId, `出现未登记的预览文章：${post.slug}`)
  assert.equal(frontmatterValue(post.frontmatter, 'topicId'), topicId, `${post.slug} topicId 错误`)
  assert.equal(frontmatterValue(post.frontmatter, 'topicCluster'), 'ai-practice-toolchain')
  assert.equal(frontmatterValue(post.frontmatter, 'planetTopicUrl'), `${groupUrl}/topic/${topicId}`)

  const gateItems = frontmatterList(post.frontmatter, 'gateItems')
  assert.ok(gateItems.length >= 2 && gateItems.length <= 5, `${post.slug} gateItems 必须为 2～5 项`)
  assert.ok(gateItems.every((item) => item.length >= 6), `${post.slug} 权益项必须写清具体内容`)

  const cover = frontmatterValue(post.frontmatter, 'cover')
  assert.ok(cover?.startsWith('/images/blog/'), `${post.slug} 必须使用本地封面`)
  const coverPath = path.join(projectDir, 'public', cover.slice(1))
  assert.ok((await fs.stat(coverPath)).isFile(), `${post.slug} 封面不存在：${cover}`)

  const combined = `${post.frontmatter}\n${post.body}`
  assert.doesNotMatch(combined, /<e\b|\/Users\/|\/var\/folders\//, `${post.slug} 含星球标签或本机绝对路径`)
  assert.doesNotMatch(combined, /(?:sk-ant-|sessionKey=|api[_-]?key\s*[:=]\s*[^\s<{]|signed[_-]?url)/i, `${post.slug} 疑似泄露凭证`)
  assert.doesNotMatch(combined, /https?:\/\/[^\s)]+(?:Expires|Signature|X-Amz-Credential)=/i, `${post.slug} 含临时签名地址`)
  assert.doesNotMatch(post.body, /^##\s+(?:完整部署|完整命令|环境变量配置|Cookie 获取|Session ID 获取|后台配置|curl 测试)/m, `${post.slug} 公开了会员实操章节`)
}

const settings = JSON.parse(await fs.readFile(path.join(projectDir, 'content', 'collections', 'settings.json'), 'utf8'))
assert.equal(settings.planetUrl, groupUrl)
assert.equal(settings.planetQrCode, '/images/zhishixingqiu.jpg')

console.log('AI 实践公开预览校验通过：8 个 slug、topic 映射、封面与敏感信息均符合约束。')

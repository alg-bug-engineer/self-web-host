#!/usr/bin/env node

import assert from 'node:assert/strict'
import { buildContentOperationsReport } from '../lib/content-operations.mjs'

const commonArticle = {
  published: true,
  tags: ['AI原生一代', '学习能力'],
  description: '生成式 AI 进入学习后，学习者需要理解、验证并迁移知识。',
  body: '学习者需要理解、验证并迁移知识。'.repeat(80),
}
const articles = [
  {
    ...commonArticle,
    filename: 'daily-2026-08-11-ai-native-learning.mdx',
    date: '2026-08-11T08:30:00+08:00',
    slug: 'ai-native-learning',
    title: 'AI 原生一代真正需要培养的学习能力',
  },
  {
    ...commonArticle,
    filename: 'daily-2026-08-10-ai-native-learning.mdx',
    date: '2026-08-10T08:30:00+08:00',
    slug: 'ai-native-learning',
    title: 'AI 原生一代如何建立不被工具替代的学习能力',
  },
  {
    published: true,
    filename: 'wechat-2026-08-07-example.mdx',
    date: '2026-08-07T10:00:00+08:00',
    slug: 'wechat-example',
    title: '公众号同步文章',
    description: '同步文章摘要',
    tags: ['公众号'],
    body: '正文',
  },
]
const manifests = [{
  date: '2026-08-11',
  slug: 'ai-native-learning',
  websiteUrl: 'https://ai-knowledgepoints.cn/blog/daily-2026-08-11-ai-native-learning',
}]
const publishState = {
  '2026-08-11:ai-native-learning': {
    status: 'draft',
    draftMediaId: 'must-not-leak',
    contentHash: 'must-not-leak-either',
    updatedAt: '2026-08-11T01:00:00Z',
    publishNote: 'freepublish API 未授权（48001），已自动保留为公众号草稿。',
  },
}
const rss = {
  checked: true,
  reachable: true,
  loginStatus: true,
  feedExists: true,
  feedName: '芝士AI吃鱼',
  itemCount: 0,
  checkedAt: '2026-08-11T02:00:00Z',
  accessToken: 'must-not-leak-token',
}

const report = buildContentOperationsReport({
  now: new Date('2026-08-11T02:00:00Z'),
  articles,
  manifests,
  publishState,
  rss,
})
assert.equal(report.status, 'limited')
assert.equal(report.website.todayPublished, true)
assert.equal(report.website.cadence7d, 2)
assert.ok(report.website.diversity.conflict)
assert.equal(report.delivery.wechat.status, 'draft')
assert.equal(report.delivery.wechat.limitation, 'freepublish-api-unauthorized')
assert.equal(report.inboundSync.importedWechatArticles, 1)
assert.equal(report.inboundSync.rss.itemCount, 0)
assert.ok(report.issues.some((issue) => issue.code === 'wechat-rss-empty'))
assert.ok(report.issues.some((issue) => issue.code === 'freepublish-api-unauthorized'))
const serialized = JSON.stringify(report)
assert.ok(!serialized.includes('must-not-leak'))
assert.ok(!serialized.includes('accessToken'))

const stale = buildContentOperationsReport({
  now: new Date('2026-08-13T03:00:00Z'),
  articles,
  manifests,
  publishState,
  rss: { ...rss, itemCount: 2 },
})
assert.equal(stale.status, 'degraded')
assert.ok(stale.issues.some((issue) => issue.code === 'daily-content-stale'))

const missedScheduledRun = buildContentOperationsReport({
  now: new Date('2026-08-12T01:35:00Z'),
  articles,
  manifests,
  publishState,
  rss: { ...rss, itemCount: 2 },
})
assert.equal(missedScheduledRun.website.expectedToday, true)
assert.ok(missedScheduledRun.issues.some((issue) => issue.code === 'daily-content-stale'))

const healthy = buildContentOperationsReport({
  now: new Date('2026-08-11T02:00:00Z'),
  articles: [articles[0]],
  manifests,
  publishState: {
    '2026-08-11:ai-native-learning': { status: 'published', updatedAt: '2026-08-11T01:00:00Z' },
  },
  rss: { ...rss, itemCount: 2 },
})
assert.equal(healthy.status, 'healthy')
assert.equal(healthy.delivery.wechat.publicPublished, true)

console.log('私有内容运营健康模型测试通过：日更时效、重复、公众号草稿限制、RSS 与敏感字段均已覆盖。')

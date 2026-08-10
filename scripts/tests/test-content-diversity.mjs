import assert from 'node:assert/strict'
import path from 'node:path'
import {
  TOPIC_CATALOG,
  assertContentDiversity,
  compareArticleCandidate,
  inferTopicCluster,
  loadArticleHistory,
  parseArticle,
  selectTopic,
} from '../lib/content-diversity.mjs'

const projectDir = path.resolve(import.meta.dirname, '..', '..')
const history = await loadArticleHistory(path.join(projectDir, 'content', 'posts'), { beforeDate: '2026-08-12' })
const august10 = history.find((article) => article.filename.startsWith('daily-2026-08-10-'))
const august11 = history.find((article) => article.filename.startsWith('daily-2026-08-11-'))

assert.ok(august10 && august11, '缺少用于防重复回归的两篇真实日更文章')
const knownDuplicate = compareArticleCandidate({ ...august11, slug: 'renamed-learning-article', markdown: august11.body }, [august10])
assert.ok(knownDuplicate.reasons.length > 0, '仅更换 slug 后，已知重复文章仍应被识别')
assert.match(knownDuplicate.reasons.join('；'), /标题与标签共同相似/)
assert.throws(
  () => assertContentDiversity({ ...august11, markdown: august11.body }, [august10]),
  /过于相似/,
  '真实的连续重复文章必须在发布前被阻断',
)

const distinctCandidate = {
  title: 'Agent 演示成功之后，评测为什么才刚刚开始',
  description: '一个智能体偶尔跑通任务，并不能说明它可以稳定进入生产系统。本文讨论可重复评测、失败分类、人工接管和成本边界怎样共同决定自动化系统是否可靠。',
  slug: 'agent-evaluation-after-demo',
  tags: ['Agent', '智能体评测', 'AI工程', '可靠性'],
  markdown: '评测集需要覆盖任务成功、工具失败、权限边界和人工接管。'.repeat(80),
}
assert.doesNotThrow(() => assertContentDiversity(distinctCandidate, [august10, august11]))

const nextTopic = selectTopic('2026-08-12', history)
assert.notEqual(nextTopic.cluster, 'learning', '连续两篇学习主题之后不应继续选择学习主题')

const simulatedHistory = []
const selected = []
for (let day = 12; day <= 17; day += 1) {
  const date = `2026-08-${day}`
  const topic = selectTopic(date, simulatedHistory, TOPIC_CATALOG)
  selected.push(topic)
  simulatedHistory.unshift({
    filename: `daily-${date}-${topic.id}.mdx`,
    date: `${date}T08:30:00+08:00`,
    title: topic.prompt,
    description: topic.prompt,
    topicId: topic.id,
    topicCluster: topic.cluster,
    tags: [],
  })
}
assert.equal(new Set(selected.map((topic) => topic.id)).size, selected.length, '主题标识在目录耗尽前不应重复')
assert.ok(new Set(selected.map((topic) => topic.cluster)).size >= 4, '六次日更至少应覆盖四个主题簇')
for (let index = 1; index < selected.length; index += 1) {
  assert.notEqual(selected[index].cluster, selected[index - 1].cluster, '不应连续选择相同主题簇')
}

const parsed = parseArticle(`---
title: "测试文章"
description: "测试摘要"
date: 2026-08-12T08:30:00+08:00
tags:
  - "AI"
topicId: "engineering-agent-evaluation"
topicCluster: "engineering"
published: true
---
正文`, 'daily-2026-08-12-test.mdx')
assert.equal(parsed.topicId, 'engineering-agent-evaluation')
assert.equal(parsed.topicCluster, 'engineering')
assert.deepEqual(parsed.tags, ['AI'])
assert.equal(inferTopicCluster('职场新人如何在团队中获得训练'), 'work')

console.log(`内容多样性质检通过：历史 ${history.length} 篇；下一主题 ${nextTopic.cluster}/${nextTopic.id}；模拟覆盖 ${new Set(selected.map((topic) => topic.cluster)).size} 个主题簇。`)

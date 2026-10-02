import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { XMLValidator } from 'fast-xml-parser'
import { cleanMdxForLlms } from '../../src/lib/llms-markdown.mjs'
import { parseArticle, compareArticleCandidate, loadArticleHistory } from '../lib/content-diversity.mjs'

const root = new URL('../../', import.meta.url)
const read = (file) => fs.readFile(new URL(file, root), 'utf8')
const filename = 'commentary-2026-10-02-bootloops-verification-stamp.mdx'
const article = await read(`content/posts/${filename}`)
for (const pattern of [
  /postType: commentary/, /commentaryTopic: products/, /published: true/, /access: public/,
  /这是项目主导者的叙述/, /并非 Anthropic 项目/, /preliminary/,
  /这项留一验证的 certified 判定提供的是数值证据，不构成证明/,
  /文档还称/, /固定文件防的是未经批准的改动/, /不能免除对验收标准本身的审查/,
  /没有参与拟合的点/, /最差那个点，而不是平均表现/,
  /开篇及公式示例为假想场景/, /未在本文中独立复现实验或审计源码/,
  /资料核对：2026 年 10 月 2 日/,
  /https:\/\/www.anthropic.com\/research\/claude-shaped-science/,
  /https:\/\/bootloops.ai\/harness.html/, /https:\/\/bootloops.ai\/tools\/gatekeeper.html/,
  /https:\/\/bootloops.ai\/papers.html/,
]) assert.match(article, pattern)
assert.doesNotMatch(article, /<!--|亲测|无法随手修改|36 篇已发表/)
assert.equal((article.match(/<ArticleDiagram\b/g) || []).length, 1)
const parsed = parseArticle(article, filename)
const previous = (await loadArticleHistory(fileURLToPath(new URL('content/posts/', root)))).filter((p) => p.filename !== filename)
const comparison = compareArticleCandidate({ ...parsed, markdown: parsed.body }, previous)
assert.deepEqual(comparison.reasons, [], 'The new article must not repeat published content')
const markdown = cleanMdxForLlms(article, 'https://ai-knowledgepoints.cn')
assert.doesNotMatch(markdown, /<ArticleDiagram/)
assert.match(markdown, /!\[BootLoops 验收机制示意/)
assert.match(markdown, /聚焦留出数值验证，不是独立复现实验/)
for (const [name, width, height] of [
  ['verification-gate.svg', 1080, 1010], ['verification-gate-mobile.svg', 540, 1534],
]) {
  const svg = await read(`public/images/articles/bootloops-verification-commentary/${name}`)
  assert.equal(XMLValidator.validate(svg), true, `${name} must be valid SVG XML`)
  assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`))
  assert.match(svg, /role="img" aria-labelledby="title description"/)
  assert.match(svg, /<title id="title">[^<]+<\/title><desc id="description">[^<]+<\/desc>/)
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|javascript:|https?:\/\/(?!www.w3.org\/2000\/svg)/)
  const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]))
  assert.ok(sizes.length > 10 && Math.min(...sizes) >= 27, 'Labels must remain readable')
  for (const color of ['#FFFFFF', '#EAF7FF', '#E9FBF8', '#FFF2F2', '#FFFAE7']) assert.ok(svg.includes(color))
  for (const boundary of ['未参与拟合', '已知坏样本', '数值证据', '数学证明', '同行评审', '固定哈希不等于权限控制']) assert.ok(svg.includes(boundary))
  assert.ok(markdown.includes(`https://ai-knowledgepoints.cn/images/articles/bootloops-verification-commentary/${name}`))
}
const all = await loadArticleHistory(fileURLToPath(new URL('content/posts/', root)))
assert.deepEqual(all.filter((p) => p.topicId === parsed.topicId).map((p) => p.filename), [filename])
assert.equal(all.filter((p) => p.date.startsWith('2026-10-02')).length, 1, 'At most one new article today')
for (const slug of ['daily-2026-08-11-ai-native-generation-learning-ability', 'daily-2026-08-12-child-ai-three-questions', 'daily-2026-08-19-child-ai-define-the-problem', 'daily-2026-08-29-child-ai-project-evidence-board', 'daily-2026-09-03-child-ai-family-safety-gates']) assert.match(await read(`content/posts/${slug}.mdx`), /published: false/)
console.log('BootLoops 锐评通过：来源边界、全文去重、2 个可读原创 SVG、Markdown、当日单篇和草稿隔离。')

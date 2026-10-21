import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { XMLValidator } from 'fast-xml-parser'
import { cleanMdxForLlms } from '../../src/lib/llms-markdown.mjs'
import { parseArticle, compareArticleCandidate } from '../lib/content-diversity.mjs'

const root = new URL('../../', import.meta.url)
const read = (file) => fs.readFile(new URL(file, root), 'utf8')
const filename = 'commentary-2026-10-01-model-routing-moving-cost.mdx'
const article = await read(`content/posts/${filename}`)
for (const pattern of [
  /postType: commentary/, /commentaryTopic: products/, /published: true/, /access: public/,
  /合成任务.*仿真/, /模拟器和场景目录也没有公开/, /不将核对日期视为功能首发日期/,
  /开篇为假想场景/, /没有声称亲测节省效果/, /不表示每次切换都会增加总成本/,
  /资料核对：2026 年 10 月 1 日/,
  /https:\/\/openrouter.ai\/docs\/guides\/routing\/routers\/jev-router/,
  /https:\/\/arxiv.org\/html\/2609.28919v2/,
  /https:\/\/docs.github.com\/en\/copilot\/concepts\/models\/auto-model-selection/,
  /https:\/\/openrouter.ai\/docs\/guides\/best-practices\/prompt-caching/,
]) assert.match(article, pattern)
assert.doesNotMatch(article, /<!--|\d+%|亲测节省了/)
assert.equal((article.match(/<ArticleDiagram\b/g) || []).length, 1)
const parsed = parseArticle(article, filename)
const previous = await Promise.all(['calabash-agents-orchestration.mdx', 'commentary-2026-09-30-sonnet-max-review.mdx'].map(async (name) => parseArticle(await read(`content/posts/${name}`), name)))
assert.deepEqual(compareArticleCandidate({ ...parsed, markdown: parsed.body }, previous).reasons, [], 'New article must not repeat previous commentary')
const markdown = cleanMdxForLlms(article, 'https://ai-knowledgepoints.cn')
assert.doesNotMatch(markdown, /<ArticleDiagram/)
assert.match(markdown, /!\[模型路由的缓存成本/)
assert.match(markdown, /作者机制示意，不是实测结果/)
for (const [name, width, height] of [
  ['routing-cache-cost.svg', 1080, 936], ['routing-cache-cost-mobile.svg', 540, 1640],
]) {
  const svg = await read(`public/images/articles/routing-cache-commentary/${name}`)
  assert.equal(XMLValidator.validate(svg), true, `${name} must be valid SVG XML`)
  assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`))
  assert.match(svg, /role="img" aria-labelledby="title description"/)
  assert.match(svg, /<title id="title">[^<]+<\/title><desc id="description">[^<]+<\/desc>/)
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|javascript:|https?:\/\/(?!www.w3.org\/2000\/svg)/)
  const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map((match) => Number(match[1]))
  assert.ok(sizes.length > 10 && Math.min(...sizes) >= 25, 'Labels must remain readable')
  for (const color of ['#FFFFFF', '#EAF7FF', '#E9FBF8', '#FFF2F2', '#FFFAE7']) assert.ok(svg.includes(color))
  for (const boundary of ['若无可用缓存', '省下的费用能否覆盖重建', '也不是每次切换都会亏', '作者机制示意']) assert.ok(svg.includes(boundary))
  assert.ok(markdown.includes(`https://ai-knowledgepoints.cn/images/articles/routing-cache-commentary/${name}`))
}
const filenames = await fs.readdir(new URL('content/posts/', root))
const sameTopicPublished = []
for (const name of filenames.filter((name) => name.endsWith('.mdx'))) {
  const text = await read(`content/posts/${name}`)
  if (/published: true/.test(text.split('---')[1]) && /topicId: commentary-model-routing-moving-cost/.test(text.split('---')[1])) sameTopicPublished.push(name)
}
assert.deepEqual(sameTopicPublished, [filename], 'The same routing topic must not be published twice')
for (const slug of ['daily-2026-08-11-ai-native-generation-learning-ability', 'daily-2026-08-12-child-ai-three-questions', 'daily-2026-08-19-child-ai-define-the-problem', 'daily-2026-08-29-child-ai-project-evidence-board', 'daily-2026-09-03-child-ai-family-safety-gates']) {
  assert.match(await read(`content/posts/${slug}.mdx`), /published: false/)
}
console.log('模型路由锐评通过：原创内容、来源边界、无重复主题、2 个原创 SVG 布局、Markdown 与草稿隔离。')

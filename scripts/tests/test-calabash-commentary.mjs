import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { XMLValidator } from 'fast-xml-parser'
import { cleanMdxForLlms } from '../../src/lib/llms-markdown.mjs'
import { getPublishedCommentary } from '../../src/lib/commentary.mjs'
import { parseArticle, compareArticleCandidate } from '../lib/content-diversity.mjs'

const root = new URL('../../', import.meta.url)
const read = (file) => fs.readFile(new URL(file, root), 'utf8')
const filename = 'calabash-agents-orchestration.mdx'
const article = await read(`content/posts/${filename}`)
for (const pattern of [
  /postType: commentary/, /commentaryTopic: industry/, /published: true/, /access: public/,
  /不是同一层面的机制/, /一次只选一个专家.*也不天然糟糕/,
  /这是一份假想作战方案，不是动画剧情复述/, /再给这套系统加一道假想题/,
  /并非蛇精使了任何计谋，都可以贴这个标签/, /合体成小金刚的故事在续作里/,
  /资料核对：2026 年 9 月 30 日/, /https:\/\/www.jmlr.org\/papers\/v23\/21-0998.html/,
  /https:\/\/genai.owasp.org\/llmrisk\/llm01-prompt-injection\//,
  /https:\/\/big5.cctv.com\//, /https:\/\/backstage.sfi-sh.com\/IP\/cartoon\/25\/intro/,
]) assert.match(article, pattern)
assert.equal((article.match(/<ArticleDiagram\b/g) || []).length, 2)
const previous = parseArticle(await read('content/posts/commentary-2026-09-30-sonnet-max-review.mdx'), 'commentary-2026-09-30-sonnet-max-review.mdx')
const parsed = parseArticle(article, filename)
assert.equal(compareArticleCandidate({ ...parsed, markdown: parsed.body }, [previous]).reasons.length, 0, 'New commentary must not repeat the first article')
const published = getPublishedCommentary([{ ...parsed, slug: filename, postType: 'commentary' }, { ...previous, slug: 'previous', postType: 'commentary' }])
assert.equal(published[0].slug, filename, 'New article is newer than the prior commentary')
const markdown = cleanMdxForLlms(article, 'https://ai-knowledgepoints.cn')
assert.doesNotMatch(markdown, /<ArticleDiagram/)
assert.match(markdown, /!\[能力与协作清单/)
assert.match(markdown, /!\[情报交接流程/)
const assetDir = 'public/images/articles/calabash-agents-commentary/'
for (const [name, width, height] of [
  ['capabilities-and-coordination.svg', 1080, 782],
  ['capabilities-and-coordination-mobile.svg', 540, 1190],
  ['isolated-vs-coordinated.svg', 1080, 864],
  ['isolated-vs-coordinated-mobile.svg', 540, 1470],
]) {
  const svg = await read(assetDir + name)
  assert.equal(XMLValidator.validate(svg), true)
  assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`))
  assert.match(svg, /role="img" aria-labelledby="title description"/)
  assert.match(svg, /<title id="title">[^<]+<\/title><desc id="description">[^<]+<\/desc>/)
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|javascript:|https?:\/\/(?!www.w3.org\/2000\/svg)/)
  const sizes = [...svg.matchAll(/font-size="(\d+)"/g)].map((match) => Number(match[1]))
  assert.ok(sizes.length > 8 && Math.min(...sizes) >= 24, 'Labels must remain readable')
  for (const color of ['#FFFFFF', '#EAF7FF', '#E9FBF8', '#FFFAE7']) assert.ok(svg.includes(color))
  if (name.startsWith('capabilities')) {
    assert.match(svg, /协作类比，非 MoE 模型结构/)
    for (const name of ['大娃', '二娃', '三娃', '四娃', '五娃', '六娃', '七娃']) assert.ok(svg.includes(name))
  } else {
    assert.match(svg, /看见了/)
    assert.match(svg, /带来源交接/)
    assert.match(svg, /出发前确认/)
    assert.match(svg, /爷爷安全回来了吗/)
    assert.match(svg, /路线变化 \/ 失败/)
    assert.match(svg, /不是动画剧情复述或实测结果/)
  }
  assert.ok(markdown.includes(`https://ai-knowledgepoints.cn/images/articles/calabash-agents-commentary/${name}`))
}
for (const slug of ['daily-2026-08-11-ai-native-generation-learning-ability', 'daily-2026-08-12-child-ai-three-questions', 'daily-2026-08-19-child-ai-define-the-problem', 'daily-2026-08-29-child-ai-project-evidence-board', 'daily-2026-09-03-child-ai-family-safety-gates']) {
  assert.match(await read(`content/posts/${slug}.mdx`), /published: false/)
}
console.log('葫芦娃锐评通过：原创内容、技术边界、公开分类、4 张响应式原创 SVG、Markdown 与 5 篇草稿隔离。')

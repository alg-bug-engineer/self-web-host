import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { XMLValidator } from 'fast-xml-parser'
import { cleanMdxForLlms } from '../../src/lib/llms-markdown.mjs'

const root = new URL('../../', import.meta.url)
const read = (file) => fs.readFile(new URL(file, root), 'utf8')
const assetDir = 'public/images/articles/sonnet-cto-commentary/'
for (const [name, width, height] of [
  ['scope-staircase.svg', 1080, 712],
  ['scope-staircase-mobile.svg', 540, 1010],
  ['handoff-cost-flow.svg', 1080, 690],
  ['handoff-cost-flow-mobile.svg', 540, 1108],
]) {
  const svg = await read(assetDir + name)
  assert.equal(XMLValidator.validate(svg), true, `${name} must be valid SVG XML`)
  assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`))
  assert.match(svg, /role="img" aria-labelledby="title description"/)
  assert.match(svg, /<title id="title">[^<]+<\/title><desc id="description">[^<]+<\/desc>/)
  assert.doesNotMatch(svg, /<script|<image|<foreignObject|javascript:|https?:\/\/(?!www.w3.org\/2000\/svg)/)
  const fontSizes = [...svg.matchAll(/font-size="(\d+)"/g)].map((match) => Number(match[1]))
  assert.ok(fontSizes.length > 8)
  assert.ok(Math.min(...fontSizes) >= 24, `${name} must not shrink labels to fit`)
  assert.match(svg, /#FFFAE7/)
  assert.doesNotMatch(svg, /多代理不是问题|%|￥|\$\d/)
}
const mobileFlow = await read(assetDir + 'handoff-cost-flow-mobile.svg')
assert.match(mobileFlow, /M468 439 H504 V867 H468/, 'Review has a direct acceptance path')
assert.match(mobileFlow, /M72 650 H36 V439 H72/, 'Rework returns to review')
assert.match(mobileFlow, /不代表耗时比例/)

const article = await read('content/posts/commentary-2026-09-30-sonnet-max-review.mdx')
assert.equal((article.match(/<ArticleDiagram\b/g) || []).length, 2)
const markdown = cleanMdxForLlms(article, 'https://ai-knowledgepoints.cn')
assert.doesNotMatch(markdown, /<ArticleDiagram/)
assert.match(markdown, /!\[工单范围阶梯[^\]]+\]\(https:\/\/ai-knowledgepoints.cn\/images\/articles\/sonnet-cto-commentary\/scope-staircase.svg\)/)
for (const name of ['scope-staircase', 'handoff-cost-flow']) {
  assert.ok(markdown.includes(`https://ai-knowledgepoints.cn/images/articles/sonnet-cto-commentary/${name}-mobile.svg`))
}
assert.match(markdown, /作者分析示意，不代表各环节的实测耗时或比例/)
const component = await read('src/components/ArticleDiagram.tsx')
assert.match(component, /media="\(max-width: 767px\)"/)
assert.match(component, /loading="lazy"/)
assert.match(component, /rel="noopener noreferrer"/)
console.log('锐评图解测试通过：4 个矢量布局、最小 24px 标签、条件分支与回流、响应式图片、Markdown 图文保留。')

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { XMLValidator } from 'fast-xml-parser'
import { cleanMdxForLlms } from '../../src/lib/llms-markdown.mjs'
import { parseArticle, compareArticleCandidate, loadArticleHistory } from '../lib/content-diversity.mjs'
import { fileURLToPath } from 'node:url'
const root = new URL('../../', import.meta.url)
const read = p => fs.readFile(new URL(p, root), 'utf8')
const slug = 'commentary-2026-10-26-ai-cad-physical-fit'
const article = await read(`content/posts/${slug}.mdx`)
for (const text of ['postType: commentary','commentaryTopic: products','date: 2026-10-26','原创假设','未调用 Kimi K3.1 Pro','未打印样件','不是 Kimi 的实测翻车记录','本文未独立复验','原始参考图尚待补充核对','/planet','/about#wechat']) assert.ok(article.includes(text), text)
assert.doesNotMatch(article,/\*\*|<script|EXPERIMENT_RESULTS|TODO|PLACEHOLDER/)
for (const url of ['https://www.kimi.ai/blog/kimi-k3-1-pro','https://www.kimi.com/code/docs/en/kimi-code/whats-new.html','https://docs.blender.org/manual/en/4.1/addons/mesh/3d_print_toolbox.html']) assert.ok(article.includes(url))
const history = await loadArticleHistory(fileURLToPath(new URL('content/posts/', root)))
const parsed = parseArticle(article, `${slug}.mdx`)
assert.deepEqual(compareArticleCandidate({...parsed, markdown:parsed.body},history.filter(x=>x.filename!==`${slug}.mdx`)).reasons, [])
for(const [name,w,h,rendered] of [['fit-layers',1080,900,666],['fit-layers-mobile',540,1420,286]]){
 const svg=await read(`public/images/commentary/${slug}/${name}.svg`)
 assert.equal(XMLValidator.validate(svg),true)
 assert.ok(svg.includes(`width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"`))
 assert.match(svg,/role="img" aria-labelledby="title desc"/)
 assert.match(svg,/<title id="title">.+<\/title><desc id="desc">.+<\/desc>/)
 assert.doesNotMatch(svg,/<script|<image|<foreignObject|javascript:/)
 assert.doesNotMatch([...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(m=>m[1]).join(' '), /%/, 'No fictional quantitative label')
 const sizes=[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>Number(m[1]))
 assert.ok(sizes.length>10)
 assert.ok(Math.min(...sizes)*rendered/w>=14,`${name}: readable at article width`)
 for(const label of ['需求与尺寸','几何与网格','工艺与配合','用途验证'])assert.ok(svg.includes(label))
 assert.match(svg,/#fef9c3/)
}
const markdown=cleanMdxForLlms(article,'https://ai-knowledgepoints.cn')
assert.doesNotMatch(markdown,/<ArticleDiagram/)
assert.ok(markdown.includes(`https://ai-knowledgepoints.cn/images/commentary/${slug}/fit-layers-mobile.svg`))
console.log('CAD physical fit commentary: scope, source boundaries, originality, SVG validity, readable responsive diagrams and Markdown outputs passed.')

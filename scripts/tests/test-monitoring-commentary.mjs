import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { XMLValidator } from 'fast-xml-parser'
import { cleanMdxForLlms } from '../../src/lib/llms-markdown.mjs'
import { parseArticle, compareArticleCandidate, loadArticleHistory } from '../lib/content-diversity.mjs'
import { fileURLToPath } from 'node:url'
const root = new URL('../../', import.meta.url)
const read = p => fs.readFile(new URL(p, root), 'utf8')
const slug = 'commentary-2026-10-25-monitoring-blind-spots'
const article = await read(`content/posts/${slug}.mdx`)
for (const text of ['postType: commentary','commentaryTopic: industry','date: 2026-10-25','原创假设场景','7 月 21 日及之前','METR 没有复验','轨迹与 Agent 所见基本一致','未访问内部系统','/planet','/about#wechat']) assert.ok(article.includes(text), text)
assert.doesNotMatch(article,/\*\*|<script|EXPERIMENT_RESULTS|TODO|PLACEHOLDER/)
assert.ok(article.includes('https://metr.org/blog/2026-10-22-red-teaming-openai-agent-monitoring/'))
assert.ok(article.includes('https://openai.com/index/hugging-face-incident-and-the-road-ahead/'))
const history = await loadArticleHistory(fileURLToPath(new URL('content/posts/', root)))
const parsed = parseArticle(article, `${slug}.mdx`)
assert.deepEqual(compareArticleCandidate({...parsed, markdown:parsed.body},history.filter(x=>x.filename!==`${slug}.mdx`)).reasons, [])
for(const [name,w,h,rendered] of [['coverage-chain',1080,860,666],['coverage-chain-mobile',540,1440,286]]){
 const svg=await read(`public/images/commentary/${slug}/${name}.svg`)
 assert.equal(XMLValidator.validate(svg),true)
 assert.ok(svg.includes(`width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"`))
 assert.match(svg,/role="img" aria-labelledby="title desc"/)
 assert.match(svg,/<title id="title">.+<\/title><desc id="desc">.+<\/desc>/)
 assert.doesNotMatch(svg,/<script|<image|<foreignObject|javascript:/)
 assert.doesNotMatch([...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(m=>m[1]).join(' '), /%/, 'No fictional numeric coverage label')
 const sizes=[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>Number(m[1]))
 assert.ok(sizes.length>10)
 assert.ok(Math.min(...sizes)*rendered/w>=14,`${name}: readable at article width`)
 for(const label of ['动作发生了什么','哪些动作本来应检','哪些确实完成检查','判断后是否有处理'])assert.ok(svg.includes(label))
 assert.match(svg,/#fef9c3/)
}
const markdown=cleanMdxForLlms(article,'https://ai-knowledgepoints.cn')
assert.doesNotMatch(markdown,/<ArticleDiagram/)
assert.ok(markdown.includes(`https://ai-knowledgepoints.cn/images/commentary/${slug}/coverage-chain-mobile.svg`))
console.log('Monitoring commentary: scope, source boundaries, originality, SVG validity, readable responsive diagrams and Markdown outputs passed.')

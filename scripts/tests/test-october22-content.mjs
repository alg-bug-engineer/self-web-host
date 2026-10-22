import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {XMLValidator} from 'fast-xml-parser'
import {summarizePublications,parsePublication} from '../check-daily-publications.mjs'
import {parseArticle,compareArticleCandidate,loadArticleHistory} from '../lib/content-diversity.mjs'

const root=new URL('../../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8')
const all=await loadArticleHistory(fileURLToPath(new URL('content/posts/',root)))
const entries=await Promise.all(all.map(async p=>({path:p.filename,raw:await read('content/posts/'+p.filename)})))
const daily=summarizePublications(entries,'2026-10-22')
assert.equal(daily.commentary.length,1,'One published Oct22 commentary')
assert.equal(daily.technicalSeries.length,1,'One registered Oct22 technical article')
assert.equal(daily.articles.length,1,'No extra Oct22 longform')
const slugs=[...daily.commentary,...daily.technicalSeries]
for(const filename of slugs){
 const article=await read('content/posts/'+filename)
 assert.doesNotMatch(article,/EXPERIMENT_RESULTS|COMMAND_DETAILS|CONCURRENCY_RESULTS|UNKNOWN_RESULTS|SLUG_PENDING|<!--/)
 assert.match(article,/access: public/)
 assert.ok(article.includes('/planet')&&article.includes('/about#wechat'))
 assert.ok(article.includes('AI 辅助制作'))
 const parsed=parseArticle(article,filename)
 const comparison=compareArticleCandidate({...parsed,markdown:parsed.body},all.filter(p=>p.filename!==filename))
 assert.deepEqual(comparison.reasons,[],filename+' must pass historical diversity')
 const diagrams=[...article.matchAll(/<ArticleDiagram\s+src="([^\"]+)"\s+mobileSrc="([^\"]+)"/g)]
 assert.ok(diagrams.length>=1,filename+' needs an explanatory original diagram')
 for(const match of diagrams){
  for(const path of [match[1],match[2]]){
   assert.ok(path.startsWith('/images/'))
   const svg=await read('public'+path)
   assert.equal(XMLValidator.validate(svg),true,path)
   assert.doesNotMatch(svg,/<script|<foreignObject|javascript:/)
   assert.ok(svg.includes('role="img"'))
   const tag=article.slice(match.index,article.indexOf('/>',match.index))
   const mobile=path===match[2], prop=Number(tag.match(mobile?/mobileHeight=\{(\d+)\}/:/\bheight=\{(\d+)\}/)[1])
   const box=svg.match(/viewBox="0 0 (\d+) (\d+)"/)
   assert.ok(Math.abs(prop/(mobile?540:1080)-Number(box[2])/Number(box[1]))<0.002,path+' reserved aspect ratio')
   const fonts=[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>Number(m[1]))
   assert.ok(fonts.length>0&&Math.min(...fonts)>=(path===match[2]?30:27),path+' source label sizes')
  }
 }
}
const tech=await read('content/posts/'+daily.technicalSeries[0])
const metadata=parsePublication(tech)
assert.equal(metadata.topicId,'agent-reliability-14')
assert.equal(metadata.topicCluster,'agent-reliability')
const downloads=[...new Set([...tech.matchAll(/\]\((\/examples\/agent-reliability-14\/[^)]+)\)/g)].map(m=>m[1]))]
assert.ok(downloads.length>=5,'Self-contained implementation, experiment, tests, result and README downloads')
for(const path of downloads)assert.ok((await read('public'+path)).length>100,path)
for(const slug of ['daily-2026-08-11-ai-native-generation-learning-ability','daily-2026-08-12-child-ai-three-questions','daily-2026-08-19-child-ai-define-the-problem','daily-2026-08-29-child-ai-project-evidence-board','daily-2026-09-03-child-ai-family-safety-gates'])assert.match(await read(`content/posts/${slug}.mdx`),/published: false/)
const commentary=await read('content/posts/'+daily.commentary[0])
assert.match(commentary,/sourceUrl: https:\/\//)
assert.match(tech,/排空/)
assert.match(tech,/合成/)
assert.match(tech,/屏障/)
assert.match(commentary,/10 月 21 日/)
assert.match(commentary,/补丁/)
assert.doesNotMatch(commentary,/\*\*/,'Commentary prose must not expose literal emphasis delimiters')
assert.ok(tech.length>6000,'Substantial self-contained longform')
assert.ok(commentary.length>2400,'Complete original commentary with evidence and boundaries')
const result=JSON.parse(await read('public/examples/agent-reliability-14/results.json'))
assert.ok(Object.keys(result).length>=8,'Complete named experimental scenarios')
const strategy=await read('docs/editorial-strategy.md')
assert.match(strategy,/待具备可运行模型、可固定版本的真实输出和证据、可审查细粒度标签后推进/)
assert.match(strategy,/14\. 已编写/)
console.log('October 22 pair: daily lanes, series identity, evidence boundaries, downloads, diagrams, diversity and held drafts passed.')

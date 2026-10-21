import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {XMLValidator} from 'fast-xml-parser'
import {summarizePublications,parsePublication} from '../check-daily-publications.mjs'
import {parseArticle,compareArticleCandidate,loadArticleHistory} from '../lib/content-diversity.mjs'

const root=new URL('../../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8')
const all=await loadArticleHistory(fileURLToPath(new URL('content/posts/',root)))
const entries=await Promise.all(all.map(async p=>({path:p.filename,raw:await read('content/posts/'+p.filename)})))
const daily=summarizePublications(entries,'2026-10-14')
assert.equal(daily.commentary.length,1,'One published Oct14 commentary')
assert.equal(daily.technicalSeries.length,1,'One registered Oct14 technical article')
assert.equal(daily.articles.length,1,'No extra Oct14 longform')
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
   const fonts=[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>Number(m[1]))
   assert.ok(fonts.length>0&&Math.min(...fonts)>=27,path+' source label sizes')
  }
 }
}
const tech=await read('content/posts/'+daily.technicalSeries[0])
const metadata=parsePublication(tech)
assert.equal(metadata.topicId,'agent-reliability-06')
assert.equal(metadata.topicCluster,'agent-reliability')
const downloads=[...new Set([...tech.matchAll(/\]\((\/examples\/agent-reliability-06\/[^)]+)\)/g)].map(m=>m[1]))]
assert.ok(downloads.length>=5,'Self-contained implementation, experiment, tests, result and README downloads')
for(const path of downloads)assert.ok((await read('public'+path)).length>100,path)
for(const pattern of [/不调用大模型|没有调用大模型|未调用模型/,/合成|逻辑时钟/,/unknown/,/墓碑/,/崩溃/,/生产/])assert.match(tech,pattern)
for(const phrase of ['result_expired','closed_through','BEGIN IMMEDIATE','30 项 unittest','10 组具名场景','没有跨代次的全局业务去重','真实项目单独落实'])assert.ok(tech.includes(phrase),phrase)
assert.match(tech,/没有实际调用 Stripe/)
assert.match(tech,/不是断电/)
assert.match(tech,/不是墙钟 deadline/)
const commentary=await read('content/posts/'+daily.commentary[0])
assert.match(commentary,/sourceUrl: https:\/\//)
assert.match(commentary,/2026 年 10 月 14 日|2026-10-14/)
for(const phrase of ['Scion','2026 年 10 月 13 日','2,500','30,000','partial clone','sparse checkout','厂商自报'])assert.ok(commentary.includes(phrase),phrase)
assert.match(commentary,/没有独立验证/)
assert.match(commentary,/没有跑过 Scion/)
assert.match(commentary,/不适合作为 Git 的通用替代品/)
assert.match(commentary,/不等于单靠它就减少了此前下载/)
assert.match(commentary,/合成场景/)
for(const slug of ['daily-2026-08-11-ai-native-generation-learning-ability','daily-2026-08-12-child-ai-three-questions','daily-2026-08-19-child-ai-define-the-problem','daily-2026-08-29-child-ai-project-evidence-board','daily-2026-09-03-child-ai-family-safety-gates'])assert.match(await read(`content/posts/${slug}.mdx`),/published: false/)
const strategy=await read('docs/editorial-strategy.md')
assert.match(strategy,/待具备可运行模型、可固定版本的真实输出和证据、可审查细粒度标签后推进/)
console.log('October 14 pair: daily lanes, series identity, evidence boundaries, downloads, diagrams, diversity and held drafts passed.')

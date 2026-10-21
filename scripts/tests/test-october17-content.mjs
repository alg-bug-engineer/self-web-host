import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {XMLValidator} from 'fast-xml-parser'
import {summarizePublications,parsePublication} from '../check-daily-publications.mjs'
import {parseArticle,compareArticleCandidate,loadArticleHistory} from '../lib/content-diversity.mjs'

const root=new URL('../../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8')
const all=await loadArticleHistory(fileURLToPath(new URL('content/posts/',root)))
const entries=await Promise.all(all.map(async p=>({path:p.filename,raw:await read('content/posts/'+p.filename)})))
const daily=summarizePublications(entries,'2026-10-17')
assert.equal(daily.commentary.length,1,'One published Oct17 commentary')
assert.equal(daily.technicalSeries.length,1,'One registered Oct17 technical article')
assert.equal(daily.articles.length,1,'No extra Oct17 longform')
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
assert.equal(metadata.topicId,'agent-reliability-09')
assert.equal(metadata.topicCluster,'agent-reliability')
const downloads=[...new Set([...tech.matchAll(/\]\((\/examples\/agent-reliability-09\/[^)]+)\)/g)].map(m=>m[1]))]
assert.ok(downloads.length>=5,'Self-contained implementation, experiment, tests, result and README downloads')
for(const path of downloads)assert.ok((await read('public'+path)).length>100,path)
for(const pattern of [/不调用大模型|没有调用大模型|没有调用模型|未调用模型|没有模型调用/,/合成/,/崩溃/,/上界/])assert.match(tech,pattern)
for(const phrase of ['预留','对账','事务','unknown','合成'])assert.ok(tech.includes(phrase),phrase)
const result=JSON.parse(await read('public/examples/agent-reliability-09/results.json'))
assert.equal(Object.keys(result).length,12)
assert.deepEqual(result.concurrent_admission.outcomes,{budget_exceeded:5,reserved:3})
assert.equal(result.concurrent_admission.exposure_cents,90)
assert.equal(result.unknown_keeps_maximum.ledger.exposure_cents,60)
assert.equal(result.provider_bound_violation.ledger.exposure_cents,120)
assert.equal(result.provider_bound_violation.ledger.frozen,true)
assert.equal(result.provider_bound_violation.ledger.remaining_cents,-20)
for(const phase of ['reserve','claim','settle'])for(const position of ['before','after'])assert.equal(result[`${phase}_${position}_commit`].exit_code,73)
const commentary=await read('content/posts/'+daily.commentary[0])
assert.match(commentary,/sourceUrl: https:\/\//)
assert.match(commentary,/2026 年 10 月 16 日|2026-10-17/)
for(const phrase of ['20/196','9/244','184/549','非特异性','10 月 16 日','10 月 12 日','没有复现','受控','人授权'])assert.ok(commentary.includes(phrase),phrase)
for(const slug of ['daily-2026-08-11-ai-native-generation-learning-ability','daily-2026-08-12-child-ai-three-questions','daily-2026-08-19-child-ai-define-the-problem','daily-2026-08-29-child-ai-project-evidence-board','daily-2026-09-03-child-ai-family-safety-gates'])assert.match(await read(`content/posts/${slug}.mdx`),/published: false/)
const strategy=await read('docs/editorial-strategy.md')
assert.match(strategy,/待具备可运行模型、可固定版本的真实输出和证据、可审查细粒度标签后推进/)
console.log('October 17 pair: daily lanes, series identity, evidence boundaries, downloads, diagrams, diversity and held drafts passed.')

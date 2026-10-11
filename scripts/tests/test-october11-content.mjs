import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {XMLValidator} from 'fast-xml-parser'
import {summarizePublications} from '../check-daily-publications.mjs'
import {parseArticle,compareArticleCandidate,loadArticleHistory} from '../lib/content-diversity.mjs'
const root=new URL('../../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8')
const slugs=['agent-reliability-03-unknown-reconciliation','commentary-2026-10-11-evaluation-stage-boundary']
const all=await loadArticleHistory(fileURLToPath(new URL('content/posts/',root)))
for(const slug of slugs){
 const article=await read('content/posts/'+slug+'.mdx')
 assert.doesNotMatch(article,/EXPERIMENT_RESULTS|COMMAND_DETAILS|CONCURRENCY_RESULTS|UNKNOWN_RESULTS|<!--/)
 assert.ok(article.includes('/planet')&&article.includes('/about#wechat'));assert.ok(article.includes('AI 辅助制作'))
 const parsed=parseArticle(article,slug+'.mdx'),comparison=compareArticleCandidate({...parsed,markdown:parsed.body},all.filter(p=>p.filename!==slug+'.mdx'))
 assert.deepEqual(comparison.reasons,[],slug)
 for(const path of [...article.matchAll(/(?:src|mobileSrc)="(\/images\/[^\"]+)"/g)].map(m=>m[1])){
  const svg=await read('public'+path);assert.equal(XMLValidator.validate(svg),true);assert.doesNotMatch(svg,/<script|<foreignObject|javascript:/);assert.ok(svg.includes('role="img"'))
  const min=Math.min(...[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>Number(m[1])))
  assert.ok(min>=27,path+' font sizes must stay readable')
 }
}
const daily=summarizePublications(await Promise.all(all.map(async p=>({path:p.filename,raw:await read('content/posts/'+p.filename)}))),'2026-10-11')
assert.equal(daily.commentary.length,1);assert.equal(daily.technicalSeries.length,1);assert.equal(daily.articles.length,1)
const tech=await read('content/posts/'+slugs[0]+'.mdx')
for(const name of ['reconciliation.py','run_experiment.py','test_reconciliation.py','results.json','README.md']){assert.ok(tech.includes('/examples/agent-reliability-03/'+name));assert.ok((await read('public/examples/agent-reliability-03/'+name)).length>100)}
for(const phrase of ['合成工单','没有调用大模型','unknown','迟到提交','补偿','授权'])assert.ok(tech.includes(phrase),phrase)
const commentary=await read('content/posts/'+slugs[1]+'.mdx')
for(const phrase of ['假想场景','本文没有独立复现','10 月 9 日是报告发布日期','WebArena','2024 年 4 月 16 日']) assert.ok(commentary.includes(phrase),phrase)
assert.ok(commentary.includes('https://www.anthropic.com/research/investigating-unintended-model-actions'))
for(const slug of ['daily-2026-08-11-ai-native-generation-learning-ability','daily-2026-08-12-child-ai-three-questions','daily-2026-08-19-child-ai-define-the-problem','daily-2026-08-29-child-ai-project-evidence-board','daily-2026-09-03-child-ai-family-safety-gates'])assert.match(await read(`content/posts/${slug}.mdx`),/published: false/)
console.log('October 11 pair: series registration, evidence boundaries, original SVGs, diversity and draft isolation passed.')

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {XMLValidator} from 'fast-xml-parser'
import {summarizePublications} from '../check-daily-publications.mjs'
import {parseArticle,compareArticleCandidate,loadArticleHistory} from '../lib/content-diversity.mjs'
const root=new URL('../../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8')
const slugs=['agent-reliability-01-outbox-idempotency','commentary-2026-10-06-local-model-tool-boundary']
const all=await loadArticleHistory(fileURLToPath(new URL('content/posts/',root)))
for(const slug of slugs){const a=await read('content/posts/'+slug+'.mdx');assert.doesNotMatch(a,/EXPERIMENT_RESULTS|COMMAND_DETAILS|CONCURRENCY_RESULTS|UNKNOWN_RESULTS|<!--/);assert.ok(a.includes('/planet')&&a.includes('/about#wechat'));assert.ok(a.includes('AI 辅助制作'));const parsed=parseArticle(a,slug+'.mdx');const result=compareArticleCandidate({...parsed,markdown:parsed.body},all.filter(p=>p.filename!==slug+'.mdx'));assert.deepEqual(result.reasons,[],slug);for(const path of [...a.matchAll(/(?:src|mobileSrc)="(\/images\/[^\"]+)"/g)].map(m=>m[1])){const svg=await read('public'+path);assert.equal(XMLValidator.validate(svg),true);assert.doesNotMatch(svg,/<script|<foreignObject|javascript:/);assert.ok(svg.includes('role="img"'));assert.ok(Math.min(...[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>+m[1]))>=27)}}
const daily=summarizePublications(await Promise.all(all.map(async p=>({path:p.filename,raw:await read('content/posts/'+p.filename)}))),'2026-10-06');assert.equal(daily.commentary.length,1);assert.equal(daily.technicalSeries.length,1);assert.equal(daily.articles.length,1)
const tech=await read('content/posts/'+slugs[0]+'.mdx');for(const filename of ['reliability.py','run_experiment.py','test_reliability.py','results.json','README.md']) {assert.ok(tech.includes('/examples/agent-reliability-01/'+filename));assert.ok((await read('public/examples/agent-reliability-01/'+filename)).length>100)};for(const s of ['没有调用大模型','合成','unknown','同一个事务','断电','exactly-once'])assert.ok(tech.includes(s),s)
for(const p of ['daily-2026-08-11-ai-native-generation-learning-ability','daily-2026-08-12-child-ai-three-questions','daily-2026-08-19-child-ai-define-the-problem','daily-2026-08-29-child-ai-project-evidence-board','daily-2026-09-03-child-ai-family-safety-gates'])assert.match(await read(`content/posts/${p}.mdx`),/published: false/)
console.log('October 6 pair: series registration, evidence boundaries, original SVGs, content diversity and draft isolation passed.')

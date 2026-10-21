import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {XMLValidator} from 'fast-xml-parser'
import {summarizePublications} from '../check-daily-publications.mjs'
import {cleanMdxForLlms} from '../../src/lib/llms-markdown.mjs'
import {parseArticle,compareArticleCandidate,loadArticleHistory} from '../lib/content-diversity.mjs'
const root=new URL('../../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8')
const tech='rag-evaluation-04-release-gates',opinion='commentary-2026-10-04-durable-agent-receipt'
const articles=await Promise.all([tech,opinion].map(s=>read(`content/posts/${s}.mdx`)))
for(const a of articles){assert.doesNotMatch(a,/EXPERIMENT_RESULTS|<!--/);assert.ok(a.includes('/planet')&&a.includes('/about#wechat'));assert.ok(a.includes('published: true'));assert.ok(a.includes('2026 年 10 月 4 日'))}
for(const s of ['人工合成','没有调用真实检索服务','不是实际人类标注','这不是生产 ACL','没有真实独立留出集','AI 辅助制作'])assert.ok(articles[0].includes(s),s)
for(const s of ['假想场景','实验阶段','本文没有运行','同一会话','requestId','至少 24 小时','200387122ca450d6387f033949423114a270b96c','AI 辅助制作'])assert.ok(articles[1].includes(s),s)
for(const s of ['https://earendil.com/posts/pi-durable/','https://docs.stripe.com/api/idempotent_requests','https://github.com/earendil-works/pi/blob/'])assert.ok(articles[1].includes(s))
const all=await loadArticleHistory(fileURLToPath(new URL('content/posts/',root)))
for(const [i,slug]of [tech,opinion].entries()){const parsed=parseArticle(articles[i],slug+'.mdx');const result=compareArticleCandidate({...parsed,markdown:parsed.body},all.filter(p=>p.filename!==slug+'.mdx'));assert.deepEqual(result.reasons,[],`${slug}: no repeated content`)}
const daily=summarizePublications(await Promise.all(all.map(async p=>({path:p.filename,raw:await read('content/posts/'+p.filename)}))),'2026-10-04')
assert.equal(daily.commentary.length,1);assert.equal(daily.technicalSeries.length,1);assert.equal(daily.articles.length,1)
for(const filename of ['evaluate.mjs','fixture.json','test.mjs','results.json','README.md']){assert.ok(articles[0].includes('/examples/rag-evaluation-04/'+filename));assert.ok((await read('public/examples/rag-evaluation-04/'+filename)).length>100)}
const results=JSON.parse(await read('public/examples/rag-evaluation-04/results.json'))
for(const row of results.calibration.candidates){const c=row.counts;assert.ok(articles[0].includes(`| ${row.threshold} | ${c.trueAccept} | ${c.falseAccept} | ${c.trueReject} | ${c.falseReject} | ${row.weightedError} |`))}
const unsafe=results.candidates.find(c=>c.name==='unsafe-uplift'),clean=results.candidates.find(c=>c.name==='clean-contrast')
assert.equal(unsafe.decision,'BLOCK');assert.equal(clean.decision,'PASS_DEMO_POLICY')
for(const pair of unsafe.paired){const other=clean.paired.find(p=>p.caseId===pair.caseId);assert.ok(articles[0].includes(`| ${pair.caseId} | ${pair.baselineScore} | ${pair.candidateScore} | ${other.candidateScore} |`))}
for(const run of results.candidates)for(const value of [run.summary.candidateScoreTotal,run.summary.candidateMean,run.summary.meanGain])assert.ok(articles[0].includes(String(value)))
for(const earlier of ['rag-evaluation-03-rrf-candidate-reranking']){assert.ok((await read(`content/posts/${earlier}.mdx`)).includes('/blog/'+tech));assert.ok(articles[0].includes('/blog/'+earlier))}
for(const [script,dir,names,article]of [['render-rag-release-diagrams.mjs','rag-evaluation-04',['release-gates','evidence-roles'],articles[0]],['render-durable-agent-diagram.mjs','durable-agent-commentary',['receipt-gap'],articles[1]]]){
 const files=names.flatMap(n=>[n+'.svg',n+'-mobile.svg']);const before=await Promise.all(files.map(f=>read(`public/images/articles/${dir}/${f}`)));execFileSync(process.execPath,['scripts/'+script],{cwd:root})
 for(const [i,f]of files.entries()){const svg=await read(`public/images/articles/${dir}/${f}`);assert.equal(svg,before[i]);assert.equal(XMLValidator.validate(svg),true);assert.ok(article.includes(f));for(const token of ['role="img"','<title','<desc','#FFFFFF','#2387DE','#FFFAE7'])assert.ok(svg.includes(token));assert.doesNotMatch(svg,/<script|<image|<foreignObject|javascript:/);assert.ok(Math.min(...[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>+m[1]))>=27);assert.ok(svg.includes(`width="${f.includes('-mobile')?540:1080}"`));const md=cleanMdxForLlms(article,'https://ai-knowledgepoints.cn');assert.ok(md.includes(f));assert.ok(!md.includes('<ArticleDiagram'))}
}
for(const p of ['daily-2026-08-11-ai-native-generation-learning-ability','daily-2026-08-12-child-ai-three-questions','daily-2026-08-19-child-ai-define-the-problem','daily-2026-08-29-child-ai-project-evidence-board','daily-2026-09-03-child-ai-family-safety-gates'])assert.match(await read(`content/posts/${p}.mdx`),/published: false/)
console.log('October 4: exactly one article + one commentary, boundaries, sources, series links, downloads, original deterministic SVGs and draft isolation passed.')

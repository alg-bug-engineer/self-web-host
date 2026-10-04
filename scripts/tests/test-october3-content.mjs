import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {XMLValidator} from 'fast-xml-parser'
import {summarizePublications} from '../check-daily-publications.mjs'
import {cleanMdxForLlms} from '../../src/lib/llms-markdown.mjs'
import {parseArticle,compareArticleCandidate,loadArticleHistory} from '../lib/content-diversity.mjs'
const root=new URL('../../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8')
const tech='rag-evaluation-03-rrf-candidate-reranking',opinion='commentary-2026-10-03-model-harness-fit'
const articles=await Promise.all([tech,opinion].map(s=>read(`content/posts/${s}.mdx`)))
for(const a of articles){assert.doesNotMatch(a,/EXPERIMENT_RESULTS|<!--/);assert.ok(a.includes('/planet')&&a.includes('/about#wechat'));assert.ok(a.includes('published: true'));assert.ok(a.includes('2026 年 10 月 3 日'))}
for(const s of ['两路词法检索','固定全局词表','不是生产 RAG','没有调用 Embedding','不实现 ACL','gold-blind','没有独立留出集','null'])assert.ok(articles[0].includes(s),s)
for(const s of ['36 道','31 道','19 道','38 道','每题只计一次运行','本文没有独立复现','最高分搭配保持一致','不能分离单个组件','预印本'])assert.ok(articles[1].includes(s),s)
for(const s of ['https://arxiv.org/abs/2610.00917','https://arxiv.org/html/2610.00917v1#S4.SS1','https://github.com/liyix/finding-the-right-fit'])assert.ok(articles[1].includes(s))
const all=await loadArticleHistory(fileURLToPath(new URL('content/posts/',root)))
for(const [i,slug]of [tech,opinion].entries()){const parsed=parseArticle(articles[i],slug+'.mdx');const result=compareArticleCandidate({...parsed,markdown:parsed.body},all.filter(p=>p.filename!==slug+'.mdx'));assert.deepEqual(result.reasons,[],`${slug}: no repeated content`)}
const daily=summarizePublications(await Promise.all(all.map(async p=>({path:p.filename,raw:await read('content/posts/'+p.filename)}))),'2026-10-03')
assert.equal(daily.commentary.length,1);assert.equal(daily.technicalSeries.length,1);assert.equal(daily.articles.length,1)
for(const filename of ['evaluate.mjs','fixture.json','test.mjs','results.json','README.md']){assert.ok(articles[0].includes('/examples/rag-evaluation-03/'+filename));assert.ok((await read('public/examples/rag-evaluation-03/'+filename)).length>100)}
const results=JSON.parse(await read('public/examples/rag-evaluation-03/results.json'))
for(const run of results.runs){const s=run.summary;assert.ok(articles[0].includes(`| ${run.id} | ${s.macroCandidateRecall.toFixed(3)} | ${s.macroFinalRecall.toFixed(3)} | ${s.meanContextChars.toFixed(3)} |`),`Exact result table ${run.id}`)}
for(const earlier of ['rag-evaluation-01-evidence-to-answer','rag-evaluation-02-chunking-evidence-mapping']){assert.ok((await read(`content/posts/${earlier}.mdx`)).includes('/blog/'+tech));assert.ok(articles[0].includes('/blog/'+earlier))}
for(const [script,dir,names,article]of [['render-rag-fusion-diagrams.mjs','rag-evaluation-03',['rank-fusion','three-budgets'],articles[0]],['render-harness-fit-diagram.mjs','harness-fit-commentary',['ranking-reversal'],articles[1]]]){
 const files=names.flatMap(n=>[n+'.svg',n+'-mobile.svg']);const before=await Promise.all(files.map(f=>read(`public/images/articles/${dir}/${f}`)));execFileSync(process.execPath,['scripts/'+script],{cwd:root})
 for(const [i,f]of files.entries()){const svg=await read(`public/images/articles/${dir}/${f}`);assert.equal(svg,before[i]);assert.equal(XMLValidator.validate(svg),true);assert.ok(article.includes(f));for(const token of ['role="img"','<title','<desc','#FFFFFF','#2387DE','#FFFAE7'])assert.ok(svg.includes(token));assert.doesNotMatch(svg,/<script|<image|<foreignObject|javascript:/);assert.ok(Math.min(...[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>+m[1]))>=27);assert.ok(svg.includes(`width="${f.includes('-mobile')?540:1080}"`));const md=cleanMdxForLlms(article,'https://ai-knowledgepoints.cn');assert.ok(md.includes(f));assert.ok(!md.includes('<ArticleDiagram'))}
}
for(const p of ['daily-2026-08-11-ai-native-generation-learning-ability','daily-2026-08-12-child-ai-three-questions','daily-2026-08-19-child-ai-define-the-problem','daily-2026-08-29-child-ai-project-evidence-board','daily-2026-09-03-child-ai-family-safety-gates'])assert.match(await read(`content/posts/${p}.mdx`),/published: false/)
console.log('October 3: exactly one article + one commentary, boundaries, sources, series links, downloads, original deterministic SVGs and draft isolation passed.')

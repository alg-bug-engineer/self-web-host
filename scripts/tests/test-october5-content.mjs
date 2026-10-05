import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {XMLValidator} from 'fast-xml-parser'
import {summarizePublications} from '../check-daily-publications.mjs'
import {cleanMdxForLlms} from '../../src/lib/llms-markdown.mjs'
import {parseArticle,compareArticleCandidate,loadArticleHistory} from '../lib/content-diversity.mjs'
const root=new URL('../../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8')
const tech='rag-evaluation-05-citation-audit',opinion='commentary-2026-10-05-context-editing-scissors'
const articles=await Promise.all([tech,opinion].map(s=>read(`content/posts/${s}.mdx`)))
for(const a of articles){assert.doesNotMatch(a,/EXPERIMENT_RESULTS|COMMAND_DETAILS|DISAGREEMENT_RESULTS|<!--/);assert.ok(a.includes('/planet')&&a.includes('/about#wechat'));assert.ok(a.includes('published: true'));assert.ok(a.includes('2026 年 10 月 5 日'))}
for(const s of ['没有调用生成模型','没有重新运行 NLI 模型','没有新增真人标注','命题级','合成数据只用于测试程序行为','精确权重版本','AI 辅助制作','100 个问题','236 个句子','306 次数字引用标记','290 个已评分','37 / 205','59 / 100','74.69%','75.35%','31 句分歧','16 次'])assert.ok(articles[0].includes(s),s)
const all=await loadArticleHistory(fileURLToPath(new URL('content/posts/',root)))
for(const [i,slug]of [tech,opinion].entries()){const parsed=parseArticle(articles[i],slug+'.mdx');const result=compareArticleCandidate({...parsed,markdown:parsed.body},all.filter(p=>p.filename!==slug+'.mdx'));assert.deepEqual(result.reasons,[],`${slug}: no repeated content`)}
const daily=summarizePublications(await Promise.all(all.map(async p=>({path:p.filename,raw:await read('content/posts/'+p.filename)}))),'2026-10-05')
assert.equal(daily.commentary.length,1);assert.equal(daily.technicalSeries.length,1);assert.equal(daily.articles.length,1)
for(const filename of ['download.mjs','source.mjs','audit.mjs','test.mjs','results.json','README.md']){assert.ok(articles[0].includes('/examples/rag-evaluation-05/'+filename),filename);assert.ok((await read('public/examples/rag-evaluation-05/'+filename)).length>100)}
const earlier='rag-evaluation-04-release-gates';assert.ok((await read(`content/posts/${earlier}.mdx`)).includes('/blog/'+tech));assert.ok(articles[0].includes('/blog/'+earlier))
const files=['audit-levels.svg','audit-levels-mobile.svg','denominator-ledger.svg','denominator-ledger-mobile.svg'];const before=await Promise.all(files.map(f=>read(`public/images/articles/rag-evaluation-05/${f}`)));execFileSync(process.execPath,['scripts/render-rag-citation-diagrams.mjs'],{cwd:root})
for(const [i,f]of files.entries()){const svg=await read(`public/images/articles/rag-evaluation-05/${f}`);assert.equal(svg,before[i]);assert.equal(XMLValidator.validate(svg),true);assert.ok(articles[0].includes(f));for(const token of ['role="img"','<title','<desc','#FFFFFF','#2387DE','#FFFAE7'])assert.ok(svg.includes(token));assert.doesNotMatch(svg,/<script|<image|<foreignObject|javascript:/);assert.ok(Math.min(...[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>+m[1]))>=27);assert.ok(svg.includes(`width="${f.includes('-mobile')?540:1080}"`));const md=cleanMdxForLlms(articles[0],'https://ai-knowledgepoints.cn');assert.ok(md.includes(f));assert.ok(!md.includes('<ArticleDiagram'))}
for(const p of ['daily-2026-08-11-ai-native-generation-learning-ability','daily-2026-08-12-child-ai-three-questions','daily-2026-08-19-child-ai-define-the-problem','daily-2026-08-29-child-ai-project-evidence-board','daily-2026-09-03-child-ai-family-safety-gates'])assert.match(await read(`content/posts/${p}.mdx`),/published: false/)
console.log('October 5: daily pair, historical/synthetic boundaries, series navigation, downloads, deterministic SVGs, draft isolation passed.')

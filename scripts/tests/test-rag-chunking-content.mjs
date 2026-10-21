import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
const root = new URL('../../', import.meta.url)
const read = p => fs.readFile(new URL(p, root), 'utf8')
const slug = 'rag-evaluation-02-chunking-evidence-mapping'
const article = await read(`content/posts/${slug}.mdx`)
for (const text of ['published: true','postType: article','topicId: rag-evaluation-02','topicCluster: rag-engineering','合成教学 fixture','没有调用 Embedding、BM25','不是生产 RAG','3 道可回答题','240 字符','并非真实业务语料','不能称作 BM25','不计算拒答率','不实现 ACL','字符坐标']) {
  assert.ok(article.includes(text), `Missing content boundary: ${text}`)
}
assert.ok(!article.includes('EXPERIMENT_RESULTS'))
for (const filename of ['evaluate.mjs','fixture.json','test.mjs','results.json','README.md']) {
  assert.ok(article.includes(`/examples/rag-evaluation-02/${filename}`))
  assert.ok((await read(`public/examples/rag-evaluation-02/${filename}`)).length > 0)
}
const first = await read('content/posts/rag-evaluation-01-evidence-to-answer.mdx')
assert.ok(first.includes(`/blog/${slug}`))
assert.ok(article.includes('/blog/rag-evaluation-01-evidence-to-answer'))
assert.ok(article.includes('/planet') && article.includes('/about#wechat'))
const files = ['evidence-mapping.svg','evidence-mapping-mobile.svg','context-budget.svg','context-budget-mobile.svg']
const before = await Promise.all(files.map(f=>read(`public/images/articles/rag-evaluation-02/${f}`)))
execFileSync(process.execPath, ['scripts/render-rag-chunking-diagrams.mjs'], { cwd: root })
for (let i=0;i<files.length;i++) {
  const svg=await read(`public/images/articles/rag-evaluation-02/${files[i]}`)
  assert.equal(svg,before[i],'SVG generator must be deterministic')
  for (const marker of ['<title','<desc','role="img"','#FFFFFF','#2387DE','#FFFAE7']) assert.ok(svg.includes(marker))
  assert.ok(article.includes(files[i]))
}
const result=JSON.parse(await read('public/examples/rag-evaluation-02/results.json'))
for (const strategy of ['fixed','overlap','paragraph']) {
  const formatted=result.runs.filter(r=>r.strategy===strategy).map(r=>r.summary.macroEvidenceRecall.toFixed(3))
  assert.ok(article.includes(`| ${formatted.join(' | ')} |`),`Missing exact result row ${strategy}`)
}
console.log('RAG第二篇内容、双向系列导航、附件、结果表、SVG生成与边界声明检查通过。')

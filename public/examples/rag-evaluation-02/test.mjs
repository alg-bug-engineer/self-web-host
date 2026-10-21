import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { covered, scoreEvidence, chunkDocuments, rankChunks, selectContext, evaluate, validateFixture } from './evaluate.mjs'

export function runTests() {
  const load = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'))
  const fixture = load('./fixture.json')
  const chunk=(start,end,docId='a',version='v2')=>({id:`${docId}/${version}/${start}/${end}`,docId,version,start,end,text:'x'.repeat(end-start)})
  const span={docId:'a',version:'v2',start:10,end:20}
  assert.equal(covered(span,[chunk(10,20)]),true)
  assert.equal(covered(span,[chunk(0,10),chunk(20,30)]),false)
  assert.equal(covered(span,[chunk(10,15),chunk(15,20)]),true)
  assert.equal(covered(span,[chunk(10,14),chunk(15,20)]),false)
  assert.equal(covered(span,[chunk(0,19)]),false)
  assert.equal(covered(span,[chunk(11,25)]),false)
  assert.equal(covered(span,[chunk(10,20,'a','v1')]),false)
  assert.equal(covered(span,[chunk(10,20,'b','v2')]),false)
  assert.equal(covered(span,[chunk(10,15),chunk(15,20,'a','v1')]),false)
  assert.equal(covered(span,[]),false)
  const fact={id:'f',supportGroups:[[span]]}
  assert.equal(scoreEvidence([fact],[chunk(10,20),chunk(10,20)]).recall,1)
  assert.equal(scoreEvidence([fact],[chunk(10,15),chunk(10,15)]).recall,0)
  assert.deepEqual(scoreEvidence([],[]),{coveredFactIds:[],coveredFacts:0,requiredFacts:0,recall:null})
  const alternative={docId:'b',version:'v2',start:0,end:5}
  assert.equal(scoreEvidence([{id:'f',supportGroups:[[span],[alternative]]}],[chunk(0,5,'b')]).recall,1)
  assert.equal(scoreEvidence([{id:'f',supportGroups:[[span,alternative]]}],[chunk(10,20)]).recall,0)
  assert.equal(scoreEvidence([{id:'f',supportGroups:[[span,alternative]]}],[chunk(10,20),chunk(0,5,'b')]).recall,1)
  const d=[{id:'a',version:'v2',text:'abcd\n\nefghij'}]
  assert.deepEqual(chunkDocuments(d,'fixed',5,2).map(c=>[c.start,c.end]),[[0,5],[5,10],[10,12]])
  assert.deepEqual(chunkDocuments(d,'overlap',5,2).map(c=>[c.start,c.end]),[[0,5],[3,8],[6,11],[9,12]])
  assert.deepEqual(chunkDocuments(d,'paragraph',5,2).map(c=>[c.start,c.end]),[[0,4],[6,12]])
  const ranked=rankChunks([{...chunk(0,5,'b'),text:'alpha'},{...chunk(0,5,'a'),text:'alpha'}],'alpha alpha')
  assert.deepEqual(ranked.map(c=>[c.docId,c.score]),[['a',1],['b',1]])
  assert.deepEqual(rankChunks(ranked,'missing'),[])
  const sizes=[chunk(0,8),chunk(10,17),chunk(20,22)]
  const budget=selectContext(sizes,'charBudget',10)
  assert.deepEqual(budget.selected.map(c=>c.text.length),[8,2])
  assert.equal(budget.usedChars,10)
  assert.equal(budget.skipped[0].reason,'does-not-fit')
  assert.equal(selectContext(sizes,'topK',2).usedChars,15)
  for (const bad of [0,-1,1.5,NaN,Infinity]) assert.throws(()=>selectContext([],'charBudget',bad))
  assert.throws(()=>selectContext([],'unknown',2))
  assert.throws(()=>chunkDocuments(d,'unknown',5,2))
  assert.throws(()=>chunkDocuments(d,'overlap',5,5))
  const invalid = (mutate, regex) => { const f=structuredClone(fixture); mutate(f); assert.throws(()=>validateFixture(f),regex) }
  invalid(f=>f.documents.push(f.documents[0]),/duplicate document/)
  invalid(f=>f.questions.push(f.questions[0]),/duplicate question/)
  invalid(f=>delete f.questions[0].facts,/missing facts/)
  invalid(f=>f.questions[0].facts.push(f.questions[0].facts[0]),/duplicate fact/)
  invalid(f=>f.questions[0].facts[0].supportGroups=[],/missing supportGroups/)
  invalid(f=>f.questions[0].facts[0].supportGroups=[[]],/empty support group/)
  invalid(f=>f.questions[0].facts[0].supportGroups[0][0].docId='missing',/missing evidence/)
  invalid(f=>f.questions[0].facts[0].supportGroups[0][0].end=10000,/invalid evidence span/)
  invalid(f=>f.questions[0].facts[0].supportGroups[0][0].start=-1,/span start/)
  invalid(f=>f.questions[0].facts[0].supportGroups[0][0].end=100,/invalid evidence span/)
  invalid(f=>f.questions[2].facts[0].supportGroups=[[{docId:'retention',version:'v1',start:0,end:10}]],/current version/)
  invalid(f=>delete f.currentVersions.logs,/current version/)
  invalid(f=>f.currentVersions.logs='missing',/missing current document/)
  invalid(f=>f.documents[0].text+='中文',/ASCII/)
  for (const param of ['chunkSize','topK','charBudget']) for (const value of [0,-1,1.5]) invalid(f=>f.parameters[param]=value,/integer/)
  invalid(f=>f.parameters.overlap=f.parameters.chunkSize,/smaller/)
  invalid(f=>f.parameters.overlap=0,/integer/)
  const empty=structuredClone(fixture); empty.questions.forEach(q=>{q.facts=[]})
  assert.ok(evaluate(empty).runs.every(r=>r.summary.macroEvidenceRecall===null))
  const result=evaluate(fixture)
  assert.deepEqual(evaluate(fixture),result,'repeat execution is deterministic')
  const reordered=structuredClone(fixture); reordered.documents.reverse()
  assert.deepEqual(evaluate(reordered),result,'document input order cannot break ties')
  assert.deepEqual(result,load('./results.json'),'committed results must match executable fixture')
  const run=(strategy,versionFilter,mode='charBudget')=>result.runs.find(r=>r.strategy===strategy&&r.versionFilter===versionFilter&&r.mode===mode)
  const question=(r,id)=>r.questions.find(q=>q.id===id)
  assert.equal(question(run('fixed',true),'boundary-condition').recall,0)
  assert.equal(question(run('overlap',true),'boundary-condition').recall,1)
  const crowded=question(run('overlap',true),'two-facts')
  assert.equal(crowded.recall,0.5); assert.equal(crowded.usedChars,240); assert.equal(crowded.duplicateSourceChars,60)
  assert.equal(question(run('fixed',true),'two-facts').recall,1)
  for (const strategy of ['fixed','overlap','paragraph']) {
    assert.equal(question(run(strategy,false),'current-version').recall,0)
    assert.equal(question(run(strategy,true),'current-version').recall,1)
  }
  assert.equal(question(run('paragraph',true),'boundary-condition').recall,0)
  assert.equal(question(run('paragraph',true,'topK'),'boundary-condition').recall,1)
  for (const r of result.runs) {
    assert.equal(r.summary.answerableQuestions,3)
    assert.equal(r.summary.unanswerableQuestions,1)
    for (const q of r.questions) {
      if (r.mode==='charBudget') assert.ok(q.usedChars<=r.limit)
      if (q.id==='no-evidence') assert.equal(q.recall,null)
      for (const c of q.ranked) assert.equal(c.text,fixture.documents.find(d=>d.id===c.docId&&d.version===c.version).text.slice(c.start,c.end))
    }
  }
  const cli=spawnSync(process.execPath,[new URL('./evaluate.mjs',import.meta.url).pathname,new URL('./fixture.json',import.meta.url).pathname],{encoding:'utf8'})
  assert.equal(cli.status,0,cli.stderr)
  assert.equal(cli.stdout,readFileSync(new URL('./results.json',import.meta.url),'utf8'),'CLI output must match results byte for byte')
  const badCli=spawnSync(process.execPath,[new URL('./evaluate.mjs',import.meta.url).pathname],{encoding:'utf8'})
  assert.equal(badCli.status,1); assert.match(badCli.stderr,/Usage:/)
  return 'RAG chunking tests passed: spans, alternatives, duplicate coverage, versions, budgets, validation, determinism, and results snapshot'
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) console.log(runTests())

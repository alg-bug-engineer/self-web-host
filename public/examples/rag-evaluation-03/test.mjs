import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tokenize, queryTerms, validateFixture, retrievalInput, passages, buildIndex, bm25Search, expandQuery, reciprocalRankFusion, ruleRerank, selectBudget, covered, scoreEvidence, retrieve, evaluate } from './evaluate.mjs'

const here=dirname(fileURLToPath(import.meta.url))
const close=(a,b) => assert.ok(Math.abs(a-b) < 1e-12, `${a} != ${b}`)
const item=(id,text) => ({id,docId:id,version:'v1',start:0,end:text.length,text,visibility:'public'})
const clone=(o) => JSON.parse(JSON.stringify(o))

export function runTests({standaloneCopy=true} = {}) {
  let checks=0
  const test=(name,fn) => { try { fn(); checks++ } catch (error) { error.message=`${name}: ${error.message}`; throw error } }
  const fixture=JSON.parse(readFileSync(join(here,'fixture.json'),'utf8'))
  const result=evaluate(fixture), input=retrievalInput(fixture)
  const question=(run,id) => result.runs.find(r => r.id === run).questions.find(q => q.id === id)
  test('tokenizer preserves exact identifiers and real document term frequency',() => {
    assert.deepEqual(tokenize('R-17 retry RETRY.'),['r-17','retry','retry'])
    assert.deepEqual(queryTerms('retry R-17 retry'),['r-17','retry'])
  })
  test('BM25 hand calculation with document TF, DF and length normalization',() => {
    const idx=buildIndex([item('a','apple apple banana'),item('b','banana carrot')])
    const r=bm25Search(idx,['apple'])
    // N=2, df=1, avgdl=2.5, tf=2, dl=3, k1=1.2, b=.75.
    const expected=Math.log(2)*4.4/(2+1.2*(0.25+0.75*3/2.5))
    close(r.ranked[0].score,expected)
    assert.equal(r.ranked[0].contributions[0].tf,2)
    assert.equal(r.operations.termDocumentChecks,2)
    assert.equal(r.operations.termContributions,1)
    const both=bm25Search(idx,['banana']).ranked
    close(both.find(c => c.id === 'b').score,Math.log(1.2)*2.2/(1+1.2*(0.25+0.75*2/2.5)))
  })
  test('BM25 empty index and all-empty-token index avoid NaN',() => {
    assert.deepEqual(bm25Search(buildIndex([]),['x']).ranked,[])
    assert.deepEqual(bm25Search(buildIndex([item('a','...')]),['x']).ranked,[])
    assert.deepEqual(bm25Search(buildIndex([item('a','x')]),[]).ranked,[])
  })
  test('BM25 ties use stable IDs; query repeats do not boost score',() => {
    const idx=buildIndex([item('b','word'),item('a','word')])
    assert.deepEqual(bm25Search(idx,['word']).ranked.map(c => c.id),['a','b'])
    assert.deepEqual(bm25Search(idx,['word','word']),bm25Search(idx,['word']))
  })
  test('global expansion is sorted, single-hop and never question-ID based',() => {
    assert.deepEqual(expandQuery(['a'],[['b','c'],['a','b']]),['a','b'])
    assert.deepEqual(expandQuery(['credential'],fixture.synonymGroups),['credential','key','token'])
    assert.deepEqual(expandQuery(['r-17'],fixture.synonymGroups),['r-17'])
  })
  test('RRF adds reciprocal ranks, deduplicates branch repeats without extra votes',() => {
    const a=item('a','A'),b=item('b','B')
    const r=reciprocalRankFusion([[a,a,b],[b,a]],60)
    assert.deepEqual(r.ranked.map(c => c.id),['a','b'])
    close(r.ranked[0].score,1/61+1/62)
    close(r.ranked[1].score,1/61+1/62)
    assert.deepEqual(r.ranked[0].ranks,[1,2])
    assert.equal(r.operations.repeatedWithinBranch,1)
    assert.equal(r.operations.uniqueCandidates,2)
    assert.equal(reciprocalRankFusion([[a]],0).ranked[0].score,1)
    assert.deepEqual(reciprocalRankFusion([],60).ranked,[])
  })
  test('RRF uses rank rather than incomparable BM25 scores',() => {
    const a=item('a','A'),b=item('b','B')
    const r=reciprocalRankFusion([[{...a,score:1e9},{...b,score:1e-9}],[{...b,score:1e20},{...a,score:0}]])
    close(r.ranked[0].score,r.ranked[1].score)
    assert.deepEqual(r.ranked.map(c => c.id),['a','b'])
    assert.equal(r.ranked[0].contributions,undefined)
  })
  test('RRF branch permutation leaves IDs and scores invariant',() => {
    const a=item('a','A'),b=item('b','B'),c=item('c','C')
    const reduce=r => r.ranked.map(({id,score}) => ({id,score}))
    assert.deepEqual(reduce(reciprocalRankFusion([[a,b],[c,a]])),reduce(reciprocalRankFusion([[c,a],[a,b]])))
  })
  test('budget is exact, skips oversized entries, continues, never truncates',() => {
    const r=selectBudget([item('large','1234567'),item('fits','123456'),item('extra','a')],6)
    assert.equal(r.usedChars,6)
    assert.deepEqual(r.selected.map(c => c.id),['fits'])
    assert.deepEqual(r.skipped.map(c => c.id),['large','extra'])
    assert.equal(r.selected[0].text,'123456')
  })
  test('rule features are text rules, with stable ties and candidate-only output',() => {
    const candidates=[{...item('b','Value 7.'),score:1},{...item('a','Value 8.'),score:0.5}]
    assert.deepEqual(ruleRerank(candidates,'value').map(c => c.id),['b','a'])
    const r=ruleRerank([{...item('x','R-17 retry only 30 seconds.'),score:1}],'R-17 retry')[0]
    assert.deepEqual(r.features,{originalTermMatches:2,identifierMatches:1,hasNumber:1,hasConstraint:1,hasNavigation:0})
    assert.equal(r.ruleScore,8)
  })
  test('numeric rule bonus can demote real evidence: a counterexample outside main fixture',() => {
    const good={...item('policy','Backup restore is unavailable.'),score:2}
    const distraction={...item('meeting','Backup restore meeting starts at 9.'),score:1}
    const candidates=[good,distraction]
    const facts=[{id:'availability',supportGroups:[[{docId:'policy',version:'v1',start:0,end:good.text.length}]]}]
    assert.equal(scoreEvidence(facts,selectBudget(candidates,40).selected).recall,1)
    const reranked=ruleRerank(candidates,'backup restore')
    assert.equal(reranked[0].docId,'meeting')
    assert.equal(reranked[0].ruleScore,3)
    assert.equal(scoreEvidence(facts,selectBudget(reranked,40).selected).recall,0)
  })
  test('gold-blind projection never reads question labels or document extra fields',() => {
    const poison={...fixture,documents:fixture.documents.map(d => ({...d,get gold(){throw new Error('gold accessed')}}))}
    Object.defineProperty(poison,'questions',{get(){throw new Error('questions accessed')}})
    const projected=retrievalInput(poison)
    assert.deepEqual(projected,input)
    assert.deepEqual(retrieve(projected,'vault deletion undo',result.runs[6]),retrieve(input,'vault deletion undo',result.runs[6]))
  })
  test('changing all gold labels cannot change any retrieval or selection output',() => {
    const altered=clone(fixture)
    for (const q of altered.questions) {q.id=`renamed-${q.id}`;q.facts=[];q.answer='This answer is never passed to retrieval.'}
    const other=evaluate(altered)
    const retrievalOnly=q => Object.fromEntries(Object.entries(q).filter(([k]) => !['id','candidateEvidence','finalEvidence'].includes(k)))
    for (let i=0;i<result.runs.length;i++) for (let j=0;j<fixture.questions.length;j++) assert.deepEqual(retrievalOnly(result.runs[i].questions[j]),retrievalOnly(other.runs[i].questions[j]))
  })
  test('depth omission cannot be fixed by reranking absent candidates',() => {
    const shallow=question('rrf-rule-d2','depth-omission'),deep=question('rrf-rule-d4','depth-omission')
    assert.equal(shallow.candidateEvidence.recall,0);assert.equal(shallow.finalEvidence.recall,0)
    assert.equal(deep.candidateEvidence.recall,1);assert.equal(deep.finalEvidence.recall,1)
    assert.ok(!shallow.candidates.some(c => c.docId === 'atlas-rule'))
    assert.equal(question('expanded-d4','depth-omission').candidateEvidence.recall,0)
  })
  test('fusion regression remains visible and is explained by equal reciprocal ranks',() => {
    assert.equal(question('bm25-d4','fusion-regression').finalEvidence.recall,1)
    const fused=question('rrf-d4','fusion-regression')
    assert.equal(fused.candidateEvidence.recall,1);assert.equal(fused.finalEvidence.recall,0)
    assert.deepEqual(fused.candidates.slice(0,2).map(c => c.docId),['vault-faq','vault-policy'])
    assert.equal(fused.candidates[0].score,fused.candidates[1].score)
    assert.equal(question('rrf-rule-d4','fusion-regression').finalEvidence.recall,1)
  })
  test('two-fact candidate and final stages stay distinct',() => {
    assert.equal(question('rrf-d2','two-facts').candidateEvidence.recall,0.5)
    assert.equal(question('rrf-d4','two-facts').candidateEvidence.recall,1)
    assert.equal(question('rrf-d4','two-facts').finalEvidence.recall,0.5)
    assert.equal(question('rrf-rule-d4','two-facts').finalEvidence.recall,1)
  })
  test('eligibility applied before indexing excludes stale and internal passages',() => {
    const filtered=question('rrf-d4','eligibility'),unfiltered=question('rrf-d4-unfiltered','eligibility')
    assert.equal(filtered.index.eligiblePassages,17);assert.equal(unfiltered.index.eligiblePassages,19)
    assert.equal(filtered.finalEvidence.recall,1);assert.equal(unfiltered.finalEvidence.recall,0)
    for (const r of result.runs.filter(r => r.eligibilityFilter)) for (const q of r.questions) for (const c of q.candidates) {
      assert.equal(c.visibility,'public');assert.equal(c.version,fixture.currentVersions[c.docId])
    }
  })
  test('80-char budget preserves an irreducible whole-passage failure',() => {
    const q=question('rrf-rule-d4-small-budget','depth-omission')
    assert.equal(q.candidateEvidence.recall,1);assert.equal(q.finalEvidence.recall,0)
    assert.ok(q.candidates.find(c => c.docId === 'atlas-rule').text.length > 80)
  })
  test('no-answer is null even with lexical candidates; not a refusal verdict',() => {
    for (const r of result.runs) {
      const q=r.questions.find(q => q.id === 'no-answer')
      assert.equal(q.candidateEvidence.recall,null);assert.equal(q.finalEvidence.recall,null)
      assert.ok(q.candidates.length > 0)
      assert.equal(r.summary.answerableQuestions,7);assert.equal(r.summary.requiredFacts,8)
    }
  })
  test('all outputs satisfy deduplication, depth, final subset and volume constraints',() => {
    for (const r of result.runs) for (const q of r.questions) {
      assert.ok(q.branches.every(b => b.ranked.length <= r.depth))
      assert.equal(new Set(q.candidates.map(c => c.id)).size,q.candidates.length)
      assert.equal(q.usedChars,q.selected.reduce((n,c) => n+c.text.length,0))
      assert.equal(q.candidateChars,q.candidates.reduce((n,c) => n+c.text.length,0))
      assert.ok(q.usedChars <= r.budget)
      for (const c of q.selected) assert.ok(q.candidates.some(x => x.id === c.id))
      assert.ok(q.finalEvidence.coveredFacts <= q.candidateEvidence.coveredFacts)
    }
  })
  test('span boundaries, touching ranges, gaps, versions and OR/AND evidence',() => {
    const span={docId:'x',version:'v1',start:1,end:5},chunk=(start,end,version='v1') => ({docId:'x',version,start,end})
    assert.ok(covered(span,[chunk(0,3),chunk(3,5)]))
    assert.ok(!covered(span,[chunk(0,3),chunk(4,5)]))
    assert.ok(!covered(span,[chunk(0,3),chunk(3,5,'v2')]))
    assert.ok(!covered(span,[{...chunk(0,5),docId:'y'}]))
    const facts=[{id:'one',supportGroups:[[span,{...span,start:7,end:8}],[{...span,start:0,end:1}]]}]
    assert.equal(scoreEvidence(facts,[chunk(0,1)]).recall,1)
    assert.equal(scoreEvidence(facts,[chunk(1,5)]).recall,0)
    assert.equal(scoreEvidence([{id:'one',supportGroups:[[span]]}],[chunk(0,5),chunk(0,5)]).coveredFacts,1)
    assert.equal(scoreEvidence([],[]).recall,null)
  })
  test('document and synonym-group input permutations preserve complete output',() => {
    const changed=clone(fixture);changed.documents.reverse();changed.synonymGroups.reverse()
    for (const g of changed.synonymGroups) g.reverse()
    assert.deepEqual(evaluate(changed),result)
  })
  test('query term order and repetition leave retrieval unchanged',() => {
    const config=result.runs[6]
    assert.deepEqual(retrieve(input,'vault deletion undo',config),retrieve(input,'undo vault deletion vault',config))
  })
  test('validation rejects corrupt spans, duplicate IDs, bad parameters and labels',() => {
    const bad=(mutate) => {const f=clone(fixture);mutate(f);assert.throws(() => validateFixture(f))}
    bad(f => f.documents.push(f.documents[0]))
    bad(f => f.questions.push(f.questions[0]))
    bad(f => f.questions[0].facts.push(f.questions[0].facts[0]))
    bad(f => f.questions[0].facts[0].supportGroups[0][0].end=10000)
    bad(f => f.questions[0].facts[0].supportGroups[0][0].version='missing')
    bad(f => f.questions[0].facts[0].supportGroups=[])
    bad(f => f.parameters.bm25.k1=0)
    bad(f => f.parameters.bm25.b=1.1)
    bad(f => f.parameters.rrfK=-1)
    bad(f => f.parameters.candidateDepths=[4,2])
    bad(f => f.parameters.charBudget=0)
    bad(f => f.synonymGroups.push(['key','other']))
    bad(f => f.documents[0].text='非ASCII')
    bad(f => f.documents[0].visibility='unknown')
    assert.throws(() => selectBudget([],0))
    assert.throws(() => reciprocalRankFusion([],-1))
    assert.throws(() => retrieve(input,'x',{...result.runs[0],method:'dense'}))
  })
  test('rerunning evaluation is deterministic and does not mutate fixture',() => {
    const before=JSON.stringify(fixture)
    assert.deepEqual(evaluate(fixture),result);assert.equal(JSON.stringify(fixture),before)
    assert.equal(passages(fixture.documents).length,19)
  })
  test('checked-in result matches computed JSON and exact CLI stdout bytes',() => {
    const snapshot=readFileSync(join(here,'results.json'),'utf8')
    assert.deepEqual(JSON.parse(snapshot),result)
    const cli=spawnSync(process.execPath,[join(here,'evaluate.mjs'),join(here,'fixture.json')],{encoding:'utf8',maxBuffer:8*1024*1024})
    assert.equal(cli.status,0,cli.stderr);assert.equal(cli.stderr,'');assert.equal(cli.stdout,snapshot)
    const timed=spawnSync(process.execPath,[join(here,'evaluate.mjs'),join(here,'fixture.json'),'--timing'],{encoding:'utf8',maxBuffer:8*1024*1024})
    assert.equal(timed.status,0);assert.equal(timed.stdout,snapshot);assert.match(timed.stderr,/Diagnostic evaluate\(\) wall time:/)
    const bad=spawnSync(process.execPath,[join(here,'evaluate.mjs')],{encoding:'utf8'})
    assert.equal(bad.status,1);assert.match(bad.stderr,/Usage:/)
  })
  if (standaloneCopy) test('all four downloadable files run identically outside repository',() => {
    const temp=mkdtempSync(join(tmpdir(),'rag-fusion-'))
    try {
      for (const name of ['evaluate.mjs','fixture.json','test.mjs','results.json']) copyFileSync(join(here,name),join(temp,name))
      const cli=spawnSync(process.execPath,['test.mjs','--no-copy'],{cwd:temp,encoding:'utf8',maxBuffer:8*1024*1024})
      assert.equal(cli.status,0,cli.stderr);assert.match(cli.stdout,/passed/)
    } finally {rmSync(temp,{recursive:true,force:true})}
  })
  return `${checks} RAG lexical fusion checks passed (including ${standaloneCopy ? 'standalone download, ' : ''}snapshot and CLI byte equality).`
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(runTests({standaloneCopy:!process.argv.includes('--no-copy')})) }
  catch (error) { console.error(error.stack); process.exitCode=1 }
}

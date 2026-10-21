import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const integer = (n, name, min = 0) => assert(Number.isSafeInteger(n) && n >= min, `${name} must be an integer >= ${min}`)
const nonempty = (s, name) => assert(typeof s === 'string' && s.length > 0, `${name} must be a nonempty string`)
const key = (d) => JSON.stringify([d.docId ?? d.id, d.version])
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
export const tokens = (s) => [...new Set(s.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [])]

export function validateFixture(f) {
  assert(f && f.schemaVersion === 1, 'unsupported schemaVersion')
  const p = f.parameters
  assert(p && f.currentVersions && typeof f.currentVersions === 'object', 'missing parameters/currentVersions')
  integer(p.chunkSize, 'chunkSize', 1); integer(p.overlap, 'overlap', 1)
  assert(p.overlap < p.chunkSize, 'overlap must be smaller than chunkSize')
  integer(p.topK, 'topK', 1); integer(p.charBudget, 'charBudget', 1)
  assert(Array.isArray(f.documents) && f.documents.length, 'documents must be nonempty')
  const docs = new Map()
  for (const d of f.documents) {
    nonempty(d.id, 'document id'); nonempty(d.version, 'version'); nonempty(d.text, 'text')
    assert(/^[\x00-\x7f]*$/.test(d.text), 'fixture text must be ASCII')
    assert(!docs.has(key(d)), 'duplicate document/version'); docs.set(key(d), d)
    nonempty(f.currentVersions[d.id], `current version for ${d.id}`)
  }
  for (const [id, version] of Object.entries(f.currentVersions)) assert(docs.has(key({id,version})), 'missing current document/version')
  assert(Array.isArray(f.questions) && f.questions.length, 'questions must be nonempty')
  const qids = new Set()
  for (const q of f.questions) {
    nonempty(q.id, 'question id'); nonempty(q.text, 'question text')
    assert(!qids.has(q.id), 'duplicate question id'); qids.add(q.id)
    assert(Array.isArray(q.facts), 'missing facts'); const ids = new Set()
    for (const fact of q.facts) {
      nonempty(fact.id, 'fact id'); assert(!ids.has(fact.id), 'duplicate fact id'); ids.add(fact.id)
      assert(Array.isArray(fact.supportGroups) && fact.supportGroups.length, 'missing supportGroups')
      for (const group of fact.supportGroups) {
        assert(Array.isArray(group) && group.length, 'empty support group')
        for (const s of group) {
          const d = docs.get(key(s)); assert(d, 'missing evidence document/version')
          integer(s.start, 'span start'); integer(s.end, 'span end', 1)
          assert(s.start < s.end && s.end <= d.text.length, 'invalid evidence span')
          assert(s.version === f.currentVersions[s.docId], 'gold evidence must use current version')
        }
      }
    }
  }
  return f
}

export function chunkDocuments(documents, strategy, size, overlap) {
  integer(size, 'chunk size', 1); integer(overlap, 'overlap')
  assert(overlap < size, 'overlap must be smaller than chunk size')
  assert(['fixed','overlap','paragraph'].includes(strategy), 'unknown strategy')
  const chunks = []
  for (const d of documents) {
    const add = (start, end) => chunks.push({id: JSON.stringify([d.id,d.version,start,end]), docId:d.id, version:d.version, start, end, text:d.text.slice(start,end)})
    if (strategy === 'paragraph') {
      for (const m of d.text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)) add(m.index, m.index+m[0].length)
    } else {
      const stride = strategy === 'overlap' ? size-overlap : size
      for (let start=0; start<d.text.length; start+=stride) {
        const end=Math.min(start+size,d.text.length); add(start,end)
        if (end===d.text.length) break
      }
    }
  }
  return chunks
}

export function rankChunks(chunks, query) {
  const terms=tokens(query)
  return chunks.map(c => {
    const present=new Set(tokens(c.text)); const matchedTerms=terms.filter(t=>present.has(t))
    return {...c,score:matchedTerms.length,matchedTerms}
  }).filter(c=>c.score>0).sort((a,b)=>b.score-a.score || compare(a.docId,b.docId) || compare(a.version,b.version) || a.start-b.start || a.end-b.end)
}

// Half-open offsets; merge touching ranges only within the same document/version.
export function covered(span, chunks) {
  const ranges=chunks.filter(c=>c.docId===span.docId && c.version===span.version).map(c=>[c.start,c.end]).sort((a,b)=>a[0]-b[0] || a[1]-b[1])
  let cursor=span.start
  for (const [start,end] of ranges) {
    if (end<=cursor) continue
    if (start>cursor) return false
    cursor=Math.max(cursor,end)
    if (cursor>=span.end) return true
  }
  return false
}
export function scoreEvidence(facts, chunks) {
  const coveredFactIds=facts.filter(f=>f.supportGroups.some(g=>g.every(s=>covered(s,chunks)))).map(f=>f.id)
  return {coveredFactIds,coveredFacts:coveredFactIds.length,requiredFacts:facts.length,recall:facts.length ? coveredFactIds.length/facts.length : null}
}
export function selectContext(ranked, mode, limit) {
  integer(limit, 'selection limit', 1); assert(['topK','charBudget'].includes(mode), 'unknown selection mode')
  const selected=[],skipped=[]; let usedChars=0
  for (const c of ranked) {
    const reason=mode==='topK' ? (selected.length>=limit ? 'top-k-full' : null) : (usedChars+c.text.length>limit ? 'does-not-fit' : null)
    if (reason) skipped.push({id:c.id,reason})
    else {selected.push(c);usedChars+=c.text.length}
  }
  return {selected,skipped,usedChars}
}
export function evaluate(input) {
  const f=validateFixture(input), runs=[]
  for (const strategy of ['fixed','overlap','paragraph']) for (const versionFilter of [false,true]) {
    const all=chunkDocuments(f.documents,strategy,f.parameters.chunkSize,f.parameters.overlap)
    const eligible=all.filter(c=>!versionFilter || c.version===f.currentVersions[c.docId])
    for (const mode of ['topK','charBudget']) {
      const limit=mode==='topK'?f.parameters.topK:f.parameters.charBudget
      const questions=f.questions.map(q=>{
        const ranked=rankChunks(eligible,q.text), context=selectContext(ranked,mode,limit)
        const uniqueChars=uniqueCoverage(context.selected)
        return {id:q.id,query:q.text,ranked,...context,uniqueSourceChars:uniqueChars,duplicateSourceChars:context.usedChars-uniqueChars,...scoreEvidence(q.facts,context.selected)}
      })
      const applicable=questions.filter(q=>q.recall!==null)
      runs.push({strategy,versionFilter,mode,limit,indexedChunks:all.length,eligibleChunks:eligible.length,questions,summary:{answerableQuestions:applicable.length,unanswerableQuestions:questions.length-applicable.length,macroEvidenceRecall:applicable.length?applicable.reduce((s,q)=>s+q.recall,0)/applicable.length:null,coveredFacts:applicable.reduce((s,q)=>s+q.coveredFacts,0),requiredFacts:applicable.reduce((s,q)=>s+q.requiredFacts,0),meanContextChars:questions.reduce((s,q)=>s+q.usedChars,0)/questions.length}})
    }
  }
  return {schemaVersion:1,parameters:f.parameters,runs}
}
function uniqueCoverage(chunks) {
  const groups=new Map(); let total=0
  for (const c of chunks) {const k=key(c); if (!groups.has(k)) groups.set(k,[]); groups.get(k).push(c)}
  for (const group of groups.values()) {
    let end=-1
    for (const c of group.sort((a,b)=>a.start-b.start)) {total+=Math.max(0,c.end-Math.max(c.start,end));end=Math.max(end,c.end)}
  }
  return total
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    assert(process.argv.length===3, 'Usage: node evaluate.mjs fixture.json')
    process.stdout.write(JSON.stringify(evaluate(JSON.parse(readFileSync(process.argv[2],'utf8'))),null,2)+'\n')
  } catch (error) { console.error(error.message); process.exitCode=1 }
}

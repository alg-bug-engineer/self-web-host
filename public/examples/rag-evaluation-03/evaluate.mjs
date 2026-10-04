import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const integer = (n, name, min = 0) => assert(Number.isSafeInteger(n) && n >= min, `${name} must be an integer >= ${min}`)
const nonempty = (s, name) => assert(typeof s === 'string' && s.length > 0, `${name} must be a nonempty string`)
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const sourceKey = (d) => JSON.stringify([d.docId ?? d.id, d.version])
const round = (n) => Number(n.toFixed(12))
export const tokenize = (s) => s.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []
export const queryTerms = (s) => [...new Set(tokenize(s))].sort(compare)

export function validateFixture(f) {
  assert(f && f.schemaVersion === 1, 'unsupported schemaVersion')
  const p = f.parameters
  assert(p && p.bm25 && Number.isFinite(p.bm25.k1) && p.bm25.k1 > 0, 'bm25 k1 must be positive')
  assert(Number.isFinite(p.bm25.b) && p.bm25.b >= 0 && p.bm25.b <= 1, 'bm25 b must be in [0,1]')
  integer(p.rrfK, 'rrfK'); integer(p.charBudget, 'charBudget', 1); integer(p.smallCharBudget, 'smallCharBudget', 1)
  assert(Array.isArray(p.candidateDepths) && p.candidateDepths.length === 2 && p.candidateDepths[0] < p.candidateDepths[1], 'candidateDepths must contain two ascending depths')
  p.candidateDepths.forEach(d => integer(d, 'candidate depth', 1))
  assert(f.currentVersions && typeof f.currentVersions === 'object', 'missing currentVersions')
  assert(Array.isArray(f.documents) && f.documents.length, 'documents must be nonempty')
  const docs = new Map()
  for (const d of f.documents) {
    nonempty(d.id, 'document id'); nonempty(d.version, 'version'); nonempty(d.text, 'text')
    assert(['public','internal'].includes(d.visibility), 'invalid visibility')
    assert(/^[\x00-\x7f]*$/.test(d.text), 'fixture text must be ASCII')
    assert(!docs.has(sourceKey(d)), 'duplicate document/version'); docs.set(sourceKey(d), d)
    nonempty(f.currentVersions[d.id], 'missing current version')
  }
  for (const [id, version] of Object.entries(f.currentVersions)) assert(docs.has(sourceKey({id,version})), 'missing current document/version')
  assert(Array.isArray(f.synonymGroups), 'missing synonymGroups')
  const seen = new Set()
  for (const g of f.synonymGroups) {
    assert(Array.isArray(g) && g.length >= 2, 'synonym group must have at least two terms')
    for (const term of g) {
      assert(typeof term === 'string' && queryTerms(term).length === 1 && queryTerms(term)[0] === term, 'invalid synonym term')
      assert(!seen.has(term), 'synonym terms must be unique across groups'); seen.add(term)
    }
  }
  assert(Array.isArray(f.questions) && f.questions.length, 'missing questions')
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
          const d = docs.get(sourceKey(s)); assert(d, 'missing evidence document/version')
          integer(s.start, 'span start'); integer(s.end, 'span end', 1)
          assert(s.start < s.end && s.end <= d.text.length, 'invalid evidence span')
          assert(d.visibility === 'public' && s.version === f.currentVersions[s.docId], 'evidence must use eligible public current version')
        }
      }
    }
  }
  return f
}

// This projection is the ONLY information the retrieval pipeline receives.
// No question id, facts, support groups, answer, evidence span, or label is passed.
export function retrievalInput(f) {
  return {
    documents:f.documents.map(({id,version,text,visibility}) => ({id,version,text,visibility})),
    currentVersions:{...f.currentVersions},
    synonymGroups:f.synonymGroups.map(g => [...g]),
    bm25:{...f.parameters.bm25}, rrfK:f.parameters.rrfK
  }
}
export function passages(documents) {
  return documents.map(d => ({id:JSON.stringify([d.id,d.version,0,d.text.length]),docId:d.id,version:d.version,start:0,end:d.text.length,text:d.text,visibility:d.visibility})).sort((a,b) => compare(a.id,b.id))
}
export function buildIndex(items) {
  const entries = [...items].sort((a,b) => compare(a.id,b.id)).map(item => {
    const terms = tokenize(item.text), tf = new Map()
    for (const t of terms) tf.set(t,(tf.get(t) ?? 0)+1)
    return {item,tf,length:terms.length}
  })
  const df = new Map()
  for (const e of entries) for (const term of e.tf.keys()) df.set(term,(df.get(term) ?? 0)+1)
  const totalTokens = entries.reduce((n,e) => n+e.length,0)
  return {entries,df,N:entries.length,averageLength:entries.length ? totalTokens/entries.length : 0,totalTokens}
}
export function bm25Search(index, terms, {k1=1.2,b=0.75} = {}) {
  assert(Number.isFinite(k1) && k1 > 0 && Number.isFinite(b) && b >= 0 && b <= 1, 'invalid BM25 parameters')
  const uniqueTerms = [...new Set(terms)].sort(compare), ranked = []
  let termDocumentChecks = 0, termContributions = 0
  for (const e of index.entries) {
    let score = 0; const matchedTerms = [], contributions = []
    for (const term of uniqueTerms) {
      termDocumentChecks++
      const tf = e.tf.get(term) ?? 0
      if (!tf) continue
      const df = index.df.get(term)
      const idf = Math.log(1+(index.N-df+0.5)/(df+0.5))
      const contribution = idf*(tf*(k1+1))/(tf+k1*(1-b+b*e.length/index.averageLength))
      score += contribution; termContributions++; matchedTerms.push(term)
      contributions.push({term,tf,df,idf:round(idf),contribution:round(contribution)})
    }
    if (score > 0) ranked.push({...e.item,score,matchedTerms,contributions})
  }
  ranked.sort((a,b) => b.score-a.score || compare(a.id,b.id))
  return {ranked,operations:{termDocumentChecks,termContributions,positiveScoredPassages:ranked.length}}
}
export function expandQuery(original, groups) {
  const terms = new Set(original), initial = new Set(original)
  // Single hop against ORIGINAL terms; group and query order cannot cause chaining.
  for (const group of groups) if (group.some(t => initial.has(t))) for (const t of group) terms.add(t)
  return [...terms].sort(compare)
}
export function reciprocalRankFusion(lists, k=60) {
  integer(k, 'rrfK')
  const candidates = new Map(); let rankVisits = 0, repeatedWithinBranch = 0
  lists.forEach((list, branch) => {
    const seen = new Set(); let rank = 0
    for (const item of list) {
      rankVisits++
      // Duplicate IDs do not consume another rank or vote inside a branch.
      if (seen.has(item.id)) { repeatedWithinBranch++; continue }
      seen.add(item.id); rank++
      if (!candidates.has(item.id)) {
        const identity = Object.fromEntries(Object.entries(item).filter(([key]) => !['score','matchedTerms','contributions'].includes(key)))
        candidates.set(item.id,{...identity,score:0,ranks:Array(lists.length).fill(null)})
      }
      const c = candidates.get(item.id); c.score += 1/(k+rank); c.ranks[branch] = rank
    }
  })
  return {ranked:[...candidates.values()].sort((a,b) => b.score-a.score || compare(a.id,b.id)),operations:{rankVisits,repeatedWithinBranch,uniqueCandidates:candidates.size}}
}
export function ruleRerank(candidates, query) {
  const terms = queryTerms(query), identifiers = terms.filter(t => /^[a-z]+-\d+$/.test(t))
  return candidates.map((c,originalRank) => {
    const ts = new Set(tokenize(c.text))
    const features = {
      originalTermMatches:terms.filter(t => ts.has(t)).length,
      identifierMatches:identifiers.filter(t => ts.has(t)).length,
      hasNumber:/\b\d+\b/.test(c.text) ? 1 : 0,
      hasConstraint:[...ts].some(t => ['only','never','unless'].includes(t)) ? 1 : 0,
      hasNavigation:[...ts].some(t => ['overview','guide','glossary','index'].includes(t)) ? 1 : 0
    }
    const ruleScore = features.originalTermMatches+4*features.identifierMatches+features.hasNumber+features.hasConstraint-4*features.hasNavigation
    return {...c,ruleScore,features,originalRank:originalRank+1}
  }).sort((a,b) => b.ruleScore-a.ruleScore || a.originalRank-b.originalRank || compare(a.id,b.id))
}
export function selectBudget(ranked, budget) {
  integer(budget, 'charBudget', 1)
  const selected=[],skipped=[]; let usedChars=0
  for (const c of ranked) {
    if (usedChars+c.text.length > budget) skipped.push({id:c.id,reason:'does-not-fit',chars:c.text.length})
    else { selected.push(c); usedChars += c.text.length }
  }
  return {selected,skipped,usedChars}
}
const compact = (c) => ({...c,score:round(c.score)})
export function retrieve(input, query, config) {
  assert(['bm25','expanded','rrf','rrf-rule'].includes(config.method), 'unknown method')
  integer(config.depth,'depth',1); integer(config.budget,'budget',1)
  const all = passages(input.documents)
  const eligible = all.filter(c => !config.eligibilityFilter || (c.visibility === 'public' && c.version === input.currentVersions[c.docId]))
  const index = buildIndex(eligible), originalTerms = queryTerms(query)
  const usesExpansion = config.method !== 'bm25'
  const expandedTerms = usesExpansion ? expandQuery(originalTerms,input.synonymGroups) : originalTerms
  const requested = config.method === 'bm25' ? [['bm25',originalTerms]] : config.method === 'expanded' ? [['expanded',expandedTerms]] : [['bm25',originalTerms],['expanded',expandedTerms]]
  const branches = requested.map(([name,terms]) => {
    const result = bm25Search(index,terms,input.bm25)
    return {name,terms,positiveScoredPassages:result.ranked.length,ranked:result.ranked.slice(0,config.depth),operations:result.operations}
  })
  const fused = branches.length > 1 ? reciprocalRankFusion(branches.map(b => b.ranked),input.rrfK) : null
  const candidates = fused ? fused.ranked : branches[0].ranked
  const finalRanked = config.method === 'rrf-rule' ? ruleRerank(candidates,query) : candidates
  const context = selectBudget(finalRanked,config.budget)
  return {
    originalTerms,expandedTerms,
    index:{allPassages:all.length,eligiblePassages:eligible.length,totalTokens:index.totalTokens,averageLength:round(index.averageLength)},
    branches:branches.map(b => ({...b,ranked:b.ranked.map(compact)})),
    candidates:candidates.map(compact), finalRanked:finalRanked.map(compact),
    selected:context.selected.map(compact),skipped:context.skipped,
    candidateChars:candidates.reduce((s,c) => s+c.text.length,0),usedChars:context.usedChars,
    operations:{
      indexedPassages:eligible.length,indexedTokenOccurrences:index.totalTokens,
      expansionGroupsChecked:usesExpansion ? input.synonymGroups.length : 0,
      expansionTermsAdded:expandedTerms.length-originalTerms.length,
      termDocumentChecks:branches.reduce((s,b) => s+b.operations.termDocumentChecks,0),
      termContributions:branches.reduce((s,b) => s+b.operations.termContributions,0),
      fusionRankVisits:fused?.operations.rankVisits ?? 0,
      repeatedWithinBranch:fused?.operations.repeatedWithinBranch ?? 0,
      duplicateIdsAcrossBranches:branches.reduce((s,b) => s+b.ranked.length,0)-candidates.length,
      ruleCandidateEvaluations:config.method === 'rrf-rule' ? candidates.length : 0,
      budgetCandidateChecks:finalRanked.length
    }
  }
}
// Scoring starts here, AFTER retrieval. Touching ranges merge only within doc/version.
export function covered(span, chunks) {
  const ranges=chunks.filter(c => c.docId === span.docId && c.version === span.version).map(c => [c.start,c.end]).sort((a,b) => a[0]-b[0] || a[1]-b[1])
  let cursor=span.start
  for (const [start,end] of ranges) {
    if (end <= cursor) continue
    if (start > cursor) return false
    cursor=Math.max(cursor,end)
    if (cursor >= span.end) return true
  }
  return false
}
export function scoreEvidence(facts, chunks) {
  const coveredFactIds=facts.filter(f => f.supportGroups.some(g => g.every(s => covered(s,chunks)))).map(f => f.id)
  return {coveredFactIds,coveredFacts:coveredFactIds.length,requiredFacts:facts.length,recall:facts.length ? coveredFactIds.length/facts.length : null}
}
export function experimentConfigs(parameters) {
  const configs=[]
  for (const depth of parameters.candidateDepths) for (const method of ['bm25','expanded','rrf','rrf-rule']) configs.push({id:`${method}-d${depth}`,method,depth,budget:parameters.charBudget,eligibilityFilter:true})
  const depth=parameters.candidateDepths[1]
  configs.push({id:`rrf-d${depth}-unfiltered`,method:'rrf',depth,budget:parameters.charBudget,eligibilityFilter:false})
  configs.push({id:`rrf-rule-d${depth}-small-budget`,method:'rrf-rule',depth,budget:parameters.smallCharBudget,eligibilityFilter:true})
  return configs
}
export function evaluate(input) {
  const f=validateFixture(input), pipelineInput=retrievalInput(f)
  const runs=experimentConfigs(f.parameters).map(config => {
    const questions=f.questions.map(q => {
      const result=retrieve(pipelineInput,q.text,config)
      return {id:q.id,query:q.text,...result,candidateEvidence:scoreEvidence(q.facts,result.candidates),finalEvidence:scoreEvidence(q.facts,result.selected)}
    })
    const applicable=questions.filter(q => q.finalEvidence.recall !== null)
    const mean=(field) => round(questions.reduce((s,q) => s+q[field],0)/questions.length)
    const macro=(field) => applicable.length ? round(applicable.reduce((s,q) => s+q[field].recall,0)/applicable.length) : null
    const operationTotals=Object.fromEntries(Object.keys(questions[0].operations).map(k => [k,questions.reduce((s,q) => s+q.operations[k],0)]))
    return {...config,questions,summary:{answerableQuestions:applicable.length,unanswerableQuestions:questions.length-applicable.length,requiredFacts:applicable.reduce((s,q) => s+q.finalEvidence.requiredFacts,0),candidateCoveredFacts:applicable.reduce((s,q) => s+q.candidateEvidence.coveredFacts,0),finalCoveredFacts:applicable.reduce((s,q) => s+q.finalEvidence.coveredFacts,0),macroCandidateRecall:macro('candidateEvidence'),macroFinalRecall:macro('finalEvidence'),meanCandidateChars:mean('candidateChars'),meanContextChars:mean('usedChars'),operationTotals}}
  })
  return {schemaVersion:1,scope:'Synthetic lexical mechanism probes; no model, embeddings, neural reranker, token-price estimate or benchmark claim.',parameters:f.parameters,runs}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args=process.argv.slice(2), timing=args.includes('--timing'), paths=args.filter(a => a !== '--timing')
    assert(paths.length === 1 && args.length === (timing ? 2 : 1), 'Usage: node evaluate.mjs fixture.json [--timing]')
    const f=JSON.parse(readFileSync(paths[0],'utf8')),start=performance.now(),result=evaluate(f)
    const elapsed=performance.now()-start
    process.stdout.write(JSON.stringify(result,null,2)+'\n')
    if (timing) process.stderr.write(`Diagnostic evaluate() wall time: ${elapsed.toFixed(3)} ms; includes validation, indexing, retrieval and scoring; no warm-up or isolation; not an effectiveness, production latency or cost claim.\n`)
  } catch (error) { console.error(error.message); process.exitCode=1 }
}

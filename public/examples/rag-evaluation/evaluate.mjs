// Teaching fixture scorer, not a retriever, model runner, or semantic judge.
// Node.js 18+; no dependencies, credentials, or network calls.
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function ids(values, label) {
  assert(Array.isArray(values), `${label} must be an array`)
  assert(values.every((value) => typeof value === 'string' && value.trim()), `${label} contains an invalid ID`)
  assert(new Set(values).size === values.length, `${label} contains duplicate IDs`)
  return new Set(values)
}

export function recallAtK(requiredIds, rankedIds, k) {
  assert(Number.isInteger(k) && k > 0, 'k must be a positive integer')
  const required = ids(requiredIds, 'requiredIds')
  ids(rankedIds, 'rankedIds')
  if (!required.size) return null
  const retrieved = new Set(rankedIds.slice(0, k))
  return [...required].filter((id) => retrieved.has(id)).length / required.size
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

export function evaluate(dataset, run, k = 2) {
  assert(Number.isInteger(k) && k > 0, 'k must be a positive integer')
  assert(dataset.schemaVersion === 1, 'unsupported schemaVersion')
  assert(Array.isArray(dataset.corpus) && dataset.corpus.length > 0, 'corpus must not be empty')
  const corpusIds = ids(dataset.corpus.map((doc) => doc.id), 'corpus')
  assert(Array.isArray(dataset.cases) && dataset.cases.length > 0, 'cases must not be empty')
  const caseIds = ids(dataset.cases.map((item) => item.id), 'cases')
  assert(Array.isArray(run.results), 'results must be an array')
  const resultIds = ids(run.results.map((item) => item.caseId), 'results')
  assert(caseIds.size === resultIds.size && [...caseIds].every((id) => resultIds.has(id)), 'results must match every case exactly once')
  const results = new Map(run.results.map((result) => [result.caseId, result]))
  let supportedClaims = 0
  let totalClaims = 0
  let validCitations = 0

  const rows = dataset.cases.map((item) => {
    assert(typeof item.answerable === 'boolean', `${item.id}: answerable must be boolean`)
    const goldEvidence = ids(item.requiredEvidenceIds, `${item.id}: requiredEvidenceIds`)
    const goldFacts = ids(item.referenceFactIds, `${item.id}: referenceFactIds`)
    assert([...goldEvidence].every((id) => corpusIds.has(id)), `${item.id}: unknown gold evidence`)
    assert(item.answerable ? goldEvidence.size > 0 && goldFacts.size > 0 : goldEvidence.size === 0 && goldFacts.size === 0, `${item.id}: inconsistent answerability labels`)
    const result = results.get(item.id)
    const retrieved = ids(result.retrievedIds, `${item.id}: retrievedIds`)
    assert([...retrieved].every((id) => corpusIds.has(id)), `${item.id}: unknown retrieved evidence`)
    const context = new Set(result.retrievedIds.slice(0, k))
    assert(typeof result.answer === 'string' && result.answer.trim(), `${item.id}: answer must not be empty`)
    assert(typeof result.abstained === 'boolean', `${item.id}: abstained must be boolean`)
    assert(Array.isArray(result.claims), `${item.id}: claims must be an array`)
    // These are trusted reviewer annotations, never fields the answering model grades for itself.
    const covered = ids(result.review.coveredReferenceFactIds, `${item.id}: coveredReferenceFactIds`)
    assert([...covered].every((id) => goldFacts.has(id)), `${item.id}: unknown covered reference fact`)
    assert(!result.abstained || (result.claims.length === 0 && covered.size === 0), `${item.id}: abstention cannot contain factual claims`)
    assert(result.abstained || result.claims.length > 0, `${item.id}: non-abstention needs reviewed claims`)

    let rowSupported = 0
    for (const claim of result.claims) {
      assert(typeof claim.text === 'string' && claim.text.trim(), `${item.id}: empty claim`)
      const citations = ids(claim.citationIds, `${item.id}: citationIds`)
      const support = ids(claim.review.supportedByIds, `${item.id}: supportedByIds`)
      assert([...support].every((id) => context.has(id)), `${item.id}: reviewed support must be in top-k context`)
      // An unknown or out-of-context citation is scored as invalid, not silently dropped.
      if (citations.size && [...citations].every((id) => context.has(id))) validCitations += 1
      if (support.size) rowSupported += 1
    }
    supportedClaims += rowSupported
    totalClaims += result.claims.length
    return {
      caseId: item.id,
      evidenceRecall: recallAtK(item.requiredEvidenceIds, result.retrievedIds, k),
      referenceFactCoverage: item.answerable ? covered.size / goldFacts.size : null,
      supportedClaimRate: result.claims.length ? rowSupported / result.claims.length : null,
      correctAbstention: !item.answerable ? result.abstained : null,
      falseAbstention: item.answerable ? result.abstained : null,
    }
  })
  return {
    run: run.name,
    k,
    rows,
    summary: {
      caseCount: rows.length,
      answerableCount: rows.filter((row) => row.evidenceRecall !== null).length,
      unanswerableCount: rows.filter((row) => row.correctAbstention !== null).length,
      macroEvidenceRecall: mean(rows.flatMap((row) => row.evidenceRecall === null ? [] : [row.evidenceRecall])),
      macroReferenceFactCoverage: mean(rows.flatMap((row) => row.referenceFactCoverage === null ? [] : [row.referenceFactCoverage])),
      supportedClaims,
      totalClaims,
      microSupportedClaimRate: totalClaims ? supportedClaims / totalClaims : null,
      citationPresenceAndValidity: totalClaims ? validCitations / totalClaims : null,
      correctAbstentionRate: mean(rows.flatMap((row) => row.correctAbstention === null ? [] : [Number(row.correctAbstention)])),
      falseAbstentionRate: mean(rows.flatMap((row) => row.falseAbstention === null ? [] : [Number(row.falseAbstention)])),
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.argv[2] || new URL('./fixture.json', import.meta.url)
  const k = process.argv[3] === undefined ? 2 : Number(process.argv[3])
  const dataset = JSON.parse(await fs.readFile(filename, 'utf8'))
  for (const run of dataset.runs) console.log(JSON.stringify(evaluate(dataset, run, k), null, 2))
}

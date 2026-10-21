import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// A deterministic offline policy demo. No model, human review, network, or ACL service runs here.
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const round = n => Number(n.toFixed(12))
const object = (v, name) => assert(v !== null && typeof v === 'object' && !Array.isArray(v), `${name} must be an object`)
const keys = (v, expected, name) => {
  object(v, name)
  const actual = Object.keys(v).sort(), wanted = [...expected].sort()
  assert(actual.length === wanted.length && actual.every((key, i) => key === wanted[i]), `${name} has missing or unknown fields`)
}
const text = (v, name) => assert(typeof v === 'string' && v.trim().length > 0, `${name} must be nonempty text`)
const integer = (v, name, min = 0, max = Number.MAX_SAFE_INTEGER) => assert(Number.isSafeInteger(v) && v >= min && v <= max, `${name} must be an integer in [${min},${max}]`)
const array = (v, name, min = 0) => assert(Array.isArray(v) && v.length >= min, `${name} must be an array with >= ${min} items`)
const unique = (values, name) => {
  array(values, name)
  values.forEach(v => text(v, name))
  assert(new Set(values).size === values.length, `duplicate ${name}`)
}
const sorted = values => [...values].sort(compare)
const labelKeys = ['id', 'familyId', 'question', 'answer', 'simulatedJudgeScore', 'referenceLabel', 'rationale']
const contractKeys = ['knowledgeSnapshot', 'querySetVersion', 'judgeVersion', 'rubricVersion']
const runKeys = ['name', 'contract', 'records']
const recordKeys = ['caseId', 'simulatedJudgeScore', 'responseMode', 'answer', 'contextDocumentIds', 'citationDocumentIds']

function validateLabel(row, name) {
  keys(row, labelKeys, name)
  for (const key of ['id', 'familyId', 'question', 'answer', 'rationale']) text(row[key], `${name}.${key}`)
  integer(row.simulatedJudgeScore, `${name}.simulatedJudgeScore`, 0, 100)
  assert(typeof row.referenceLabel === 'boolean', `${name}.referenceLabel must be boolean`)
}
function validateCalibrationPolicy(p) {
  keys(p, ['thresholdCandidates', 'falseAcceptCost', 'falseRejectCost', 'tieBreak'], 'calibration policy')
  array(p.thresholdCandidates, 'thresholdCandidates', 1)
  p.thresholdCandidates.forEach(t => integer(t, 'threshold', 0, 100))
  assert(new Set(p.thresholdCandidates).size === p.thresholdCandidates.length, 'duplicate threshold')
  integer(p.falseAcceptCost, 'falseAcceptCost', 1, 100)
  integer(p.falseRejectCost, 'falseRejectCost', 1, 100)
  assert(p.tieBreak === 'lowest-threshold', 'unsupported threshold tieBreak')
}

export function validateFixture(f) {
  keys(f, ['schemaVersion', 'disclosure', 'contract', 'policy', 'documents', 'development', 'calibration', 'queries', 'baseline', 'candidates'], 'fixture')
  assert(f.schemaVersion === 1, 'unsupported schemaVersion')
  text(f.disclosure, 'disclosure')
  keys(f.contract, contractKeys, 'contract'); contractKeys.forEach(k => text(f.contract[k], `contract.${k}`))
  keys(f.policy, ['scope', 'minimumMeanGain', 'maximumCriticalDrop', 'minimumAcceptedRateDelta', 'calibration'], 'policy')
  assert(f.policy.scope === 'synthetic-demo-only', 'policy scope must be synthetic-demo-only')
  integer(f.policy.minimumMeanGain, 'minimumMeanGain', 0, 100)
  integer(f.policy.maximumCriticalDrop, 'maximumCriticalDrop', 0, 100)
  assert(Number.isFinite(f.policy.minimumAcceptedRateDelta) && f.policy.minimumAcceptedRateDelta >= 0 && f.policy.minimumAcceptedRateDelta <= 1, 'invalid minimumAcceptedRateDelta')
  validateCalibrationPolicy(f.policy.calibration)

  array(f.documents, 'documents', 1)
  const documentIds = new Set()
  for (const d of f.documents) {
    keys(d, ['id', 'text'], 'document'); text(d.id, 'document id'); text(d.text, 'document text')
    assert(!documentIds.has(d.id), 'duplicate document id'); documentIds.add(d.id)
  }
  // familyId is a hand-assigned split grouping, not a semantic near-duplicate detector.
  const ids = new Set(), families = new Set()
  const register = row => {
    assert(!ids.has(row.id), 'duplicate case id across splits'); ids.add(row.id)
    assert(!families.has(row.familyId), 'duplicate familyId across splits'); families.add(row.familyId)
  }
  for (const split of ['development', 'calibration']) {
    array(f[split], split, 1)
    for (const row of f[split]) { validateLabel(row, split); register(row) }
  }
  assert(f.calibration.some(r => r.referenceLabel) && f.calibration.some(r => !r.referenceLabel), 'calibration must contain both synthetic label classes')
  array(f.queries, 'queries', 2)
  const queries = new Map()
  for (const q of f.queries) {
    keys(q, ['id', 'familyId', 'split', 'question', 'critical', 'requiredMode', 'allowedDocumentIds', 'rationale'], 'query')
    for (const key of ['id', 'familyId', 'question', 'rationale']) text(q[key], `query.${key}`)
    assert(['replay', 'holdout-role'].includes(q.split), 'invalid query split')
    assert(typeof q.critical === 'boolean', 'critical must be boolean')
    assert(['answer', 'abstain'].includes(q.requiredMode), 'invalid requiredMode')
    unique(q.allowedDocumentIds, 'allowedDocumentIds')
    for (const id of q.allowedDocumentIds) assert(documentIds.has(id), 'unknown allowed document')
    register(q); queries.set(q.id, q)
  }
  for (const split of ['replay', 'holdout-role']) assert(f.queries.some(q => q.split === split), `missing ${split} split`)
  assert(f.queries.some(q => q.critical), 'missing critical query coverage')
  assert(f.queries.some(q => q.requiredMode === 'abstain'), 'missing abstention query coverage')
  array(f.candidates, 'candidates', 1)
  const runNames = new Set()
  for (const run of [f.baseline, ...f.candidates]) {
    keys(run, runKeys, 'run'); text(run.name, 'run name')
    assert(!runNames.has(run.name), 'duplicate run name'); runNames.add(run.name)
    keys(run.contract, contractKeys, 'run contract')
    for (const key of contractKeys) assert(run.contract[key] === f.contract[key], `run contract mismatch: ${key}`)
    array(run.records, 'run records', 1)
    const cases = new Set()
    for (const record of run.records) {
      keys(record, recordKeys, 'record'); text(record.caseId, 'caseId'); text(record.answer, 'answer')
      assert(queries.has(record.caseId), 'unknown/unpaired record caseId')
      assert(!cases.has(record.caseId), 'duplicate record caseId'); cases.add(record.caseId)
      integer(record.simulatedJudgeScore, 'record.simulatedJudgeScore', 0, 100)
      assert(['answer', 'abstain'].includes(record.responseMode), 'invalid responseMode')
      for (const field of ['contextDocumentIds', 'citationDocumentIds']) {
        unique(record[field], field)
        for (const id of record[field]) assert(documentIds.has(id), `unknown ${field} document`)
      }
      for (const id of record.citationDocumentIds) assert(record.contextDocumentIds.includes(id), 'citation absent from context')
    }
    assert(cases.size === queries.size && [...queries.keys()].every(id => cases.has(id)), 'missing/unpaired run records')
  }
  return f
}

// This fitting function accepts ONLY calibration examples and the already-declared grid/costs.
// Development, replay, candidate names, and holdout-role records cannot affect threshold choice.
export function fitThreshold(calibration, policy) {
  validateCalibrationPolicy(policy); array(calibration, 'calibration', 1)
  calibration.forEach(row => validateLabel(row, 'calibration'))
  unique(calibration.map(row => row.id), 'calibration ids')
  assert(calibration.some(r => r.referenceLabel) && calibration.some(r => !r.referenceLabel), 'calibration must contain both synthetic label classes')
  const candidates = [...policy.thresholdCandidates].sort((a, b) => a - b).map(threshold => {
    const trueAcceptIds = [], falseAcceptIds = [], trueRejectIds = [], falseRejectIds = []
    for (const row of [...calibration].sort((a, b) => compare(a.id, b.id))) {
      const accept = row.simulatedJudgeScore >= threshold
      ;(accept ? (row.referenceLabel ? trueAcceptIds : falseAcceptIds) : (row.referenceLabel ? falseRejectIds : trueRejectIds)).push(row.id)
    }
    const counts = { trueAccept: trueAcceptIds.length, falseAccept: falseAcceptIds.length, trueReject: trueRejectIds.length, falseReject: falseRejectIds.length }
    const predictedAccepts = counts.trueAccept + counts.falseAccept
    const actualAccepts = counts.trueAccept + counts.falseReject
    return {
      threshold, counts,
      weightedError: counts.falseAccept * policy.falseAcceptCost + counts.falseReject * policy.falseRejectCost,
      agreement: round((counts.trueAccept + counts.trueReject) / calibration.length),
      acceptPrecision: predictedAccepts ? round(counts.trueAccept / predictedAccepts) : null,
      acceptRecall: actualAccepts ? round(counts.trueAccept / actualAccepts) : null,
      trueAcceptIds, falseAcceptIds, trueRejectIds, falseRejectIds
    }
  })
  const chosen = [...candidates].sort((a, b) => a.weightedError - b.weightedError || a.threshold - b.threshold)[0]
  return { sourceSplit: 'calibration', sampleCount: calibration.length, falseAcceptCost: policy.falseAcceptCost, falseRejectCost: policy.falseRejectCost, tieBreak: policy.tieBreak, candidates, chosenThreshold: chosen.threshold, chosenWeightedError: chosen.weightedError, residualFalseAcceptIds: chosen.falseAcceptIds, residualFalseRejectIds: chosen.falseRejectIds }
}

// Interpret the supplied number's shortest decimal representation as the policy value.
// Cross-multiply BigInts so 7/100 >= 0.07 is not broken by 0.07 * 100 rounding.
export function rateAtLeast(delta, count, minimum) {
  assert(Number.isSafeInteger(delta), 'rate numerator must be a safe integer')
  integer(count, 'rate denominator', 1)
  assert(Number.isFinite(minimum) && minimum >= 0 && minimum <= 1, 'invalid rate minimum')
  const [coefficient, exponent = '0'] = String(minimum).split('e')
  const decimals = (coefficient.split('.')[1] ?? '').length
  const power = Number(exponent) - decimals
  const numerator = BigInt(coefficient.replace('.', '')) * (power > 0 ? 10n ** BigInt(power) : 1n)
  const denominator = power < 0 ? 10n ** BigInt(-power) : 1n
  return BigInt(delta) * denominator >= numerator * BigInt(count)
}

function summarize(pairs) {
  const count = pairs.length
  const baselineScoreTotal = pairs.reduce((sum, p) => sum + p.baselineScore, 0)
  const candidateScoreTotal = pairs.reduce((sum, p) => sum + p.candidateScore, 0)
  const baselineAccepted = pairs.filter(p => p.baselineJudgeAccept).length
  const candidateAccepted = pairs.filter(p => p.candidateJudgeAccept).length
  return {
    count, baselineScoreTotal, candidateScoreTotal,
    baselineMean: round(baselineScoreTotal / count), candidateMean: round(candidateScoreTotal / count),
    meanGain: round((candidateScoreTotal - baselineScoreTotal) / count),
    improved: pairs.filter(p => p.delta > 0).length, tied: pairs.filter(p => p.delta === 0).length, regressed: pairs.filter(p => p.delta < 0).length,
    baselineAccepted, candidateAccepted,
    baselineAcceptedRate: round(baselineAccepted / count), candidateAcceptedRate: round(candidateAccepted / count),
    acceptedRateDelta: round((candidateAccepted - baselineAccepted) / count)
  }
}
function hardSignals(q, record) {
  const allowed = new Set(q.allowedDocumentIds)
  return {
    forbiddenContextDocumentIds: sorted(record.contextDocumentIds.filter(id => !allowed.has(id))),
    forbiddenCitationDocumentIds: sorted(record.citationDocumentIds.filter(id => !allowed.has(id))),
    requiredAbstentionViolation: q.requiredMode === 'abstain' && record.responseMode !== 'abstain',
    unexpectedAbstention: q.requiredMode === 'answer' && record.responseMode === 'abstain'
  }
}

export function evaluate(fixture) {
  const f = validateFixture(fixture)
  const calibration = fitThreshold(f.calibration, f.policy.calibration)
  const threshold = calibration.chosenThreshold
  const base = new Map(f.baseline.records.map(r => [r.caseId, r]))
  const queries = [...f.queries].sort((a, b) => compare(a.id, b.id))
  const candidates = [...f.candidates].sort((a, b) => compare(a.name, b.name)).map(run => {
    const records = new Map(run.records.map(r => [r.caseId, r]))
    const pairs = queries.map(q => {
      const b = base.get(q.id), c = records.get(q.id)
      return {
        caseId: q.id, split: q.split, critical: q.critical,
        baselineScore: b.simulatedJudgeScore, candidateScore: c.simulatedJudgeScore, delta: c.simulatedJudgeScore - b.simulatedJudgeScore,
        baselineJudgeAccept: b.simulatedJudgeScore >= threshold, candidateJudgeAccept: c.simulatedJudgeScore >= threshold,
        baselineSignals: hardSignals(q, b), candidateSignals: hardSignals(q, c)
      }
    })
    const summary = summarize(pairs)
    const criticalRegressions = pairs.filter(p => p.critical && p.delta < -f.policy.maximumCriticalDrop).map(p => p.caseId)
    const aclViolations = pairs.filter(p => p.candidateSignals.forbiddenContextDocumentIds.length || p.candidateSignals.forbiddenCitationDocumentIds.length).map(p => p.caseId)
    const abstentionViolations = pairs.filter(p => p.candidateSignals.requiredAbstentionViolation).map(p => p.caseId)
    // Compare integer totals / counts, never rounded display means, for the decision.
    const gates = [
      { id: 'aggregate-judge-uplift', pass: summary.candidateScoreTotal - summary.baselineScoreTotal >= f.policy.minimumMeanGain * pairs.length, minimumMeanGain: f.policy.minimumMeanGain },
      { id: 'paired-critical-regressions', pass: criticalRegressions.length === 0, maximumDrop: f.policy.maximumCriticalDrop, violatingCaseIds: criticalRegressions },
      { id: 'calibrated-acceptance-rate', pass: rateAtLeast(summary.candidateAccepted - summary.baselineAccepted, pairs.length, f.policy.minimumAcceptedRateDelta), minimumRateDelta: f.policy.minimumAcceptedRateDelta },
      { id: 'context-and-citation-acl', pass: aclViolations.length === 0, violatingCaseIds: aclViolations },
      { id: 'required-abstention', pass: abstentionViolations.length === 0, violatingCaseIds: abstentionViolations }
    ]
    return {
      name: run.name, baseline: f.baseline.name, decision: gates.every(g => g.pass) ? 'PASS_DEMO_POLICY' : 'BLOCK',
      summary, bySplit: ['replay', 'holdout-role'].map(split => ({ split, ...summarize(pairs.filter(p => p.split === split)) })),
      gates, blockingGateIds: gates.filter(g => !g.pass).map(g => g.id), paired: pairs
    }
  })
  return {
    schemaVersion: 1,
    disclosure: 'Hand-authored synthetic judge scores, reference assignments, outputs and permissions. PASS_DEMO_POLICY is not deployment approval, model quality evidence, human-calibration evidence, or security assurance.',
    contract: { ...f.contract }, policy: structuredClone(f.policy),
    splitAudit: {
      development: f.development.length, calibration: f.calibration.length,
      replay: queries.filter(q => q.split === 'replay').length, holdoutRole: queries.filter(q => q.split === 'holdout-role').length,
      uniqueCaseIds: f.development.length + f.calibration.length + queries.length,
      familyIdsDisjoint: true, heldoutGeneralizationClaim: false,
      note: 'Split names demonstrate workflow routing only; all samples and rules were co-designed and are public. Family IDs cannot detect semantic leakage.'
    },
    calibration, candidates
  }
}

export const serialize = report => `${JSON.stringify(report, null, 2)}\n`

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2)
    assert(args.length === 1 || (args.length === 3 && args[1] === '--candidate'), 'Usage: node evaluate.mjs fixture.json [--candidate NAME]')
    const report = evaluate(JSON.parse(readFileSync(args[0], 'utf8')))
    if (args.length === 3) {
      const selected = report.candidates.find(c => c.name === args[2])
      assert(selected, 'unknown candidate name')
      report.candidates = [selected]
      if (selected.decision === 'BLOCK') process.exitCode = 2
    }
    process.stdout.write(serialize(report))
  } catch (error) {
    process.stderr.write(`Invalid release input: ${error.message}\n`)
    process.exitCode = 1
  }
}

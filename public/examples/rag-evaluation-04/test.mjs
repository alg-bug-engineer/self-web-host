import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { evaluate, fitThreshold, rateAtLeast, serialize, validateFixture } from './evaluate.mjs'

const root = dirname(fileURLToPath(import.meta.url))
const original = JSON.parse(readFileSync(join(root, 'fixture.json'), 'utf8'))
const copy = () => structuredClone(original)
const named = (f, name = 'unsafe-uplift') => f.candidates.find(c => c.name === name)
const record = (f, id, name = 'unsafe-uplift') => named(f, name).records.find(r => r.caseId === id)
const candidate = (r, name = 'unsafe-uplift') => r.candidates.find(c => c.name === name)
const gate = (r, id) => r.gates.find(g => g.id === id)
const result = () => evaluate(copy())
const changed = mutate => { const f = copy(); mutate(f); return f }
const invalid = (mutate, pattern) => assert.throws(() => evaluate(changed(mutate)), pattern)
const cli = (args, options = {}) => spawnSync(process.execPath, [join(root, 'evaluate.mjs'), ...args], { encoding: 'utf8', ...options })

export function runTests() {
  const passed = []
  const test = (name, fn) => { fn(); passed.push(name) }

  test('independent arithmetic: 550 / 8, 703 / 8 and 732 / 8', () => {
    const r = result(), bad = candidate(r), good = candidate(r, 'clean-contrast')
    assert.equal(bad.summary.baselineScoreTotal, 550)
    assert.equal(bad.summary.candidateScoreTotal, 703)
    assert.equal(good.summary.candidateScoreTotal, 732)
    assert.equal(bad.summary.baselineMean, 68.75)
    assert.equal(bad.summary.candidateMean, 87.875)
    assert.equal(good.summary.candidateMean, 91.5)
    assert.equal(bad.summary.meanGain, 19.125)
    assert.equal(good.summary.meanGain, 22.75)
    assert.deepEqual([bad.summary.improved, bad.summary.tied, bad.summary.regressed], [6, 0, 2])
  })
  test('higher average is blocked by three separate gates', () => {
    const r = candidate(result())
    assert.equal(gate(r, 'aggregate-judge-uplift').pass, true)
    assert.equal(gate(r, 'calibrated-acceptance-rate').pass, true)
    assert.equal(r.decision, 'BLOCK')
    assert.deepEqual(r.blockingGateIds, ['paired-critical-regressions', 'context-and-citation-acl', 'required-abstention'])
  })
  test('preauthored clean contrast passes every chosen demo gate', () => {
    const r = candidate(result(), 'clean-contrast')
    assert.equal(r.decision, 'PASS_DEMO_POLICY')
    assert.deepEqual(r.blockingGateIds, [])
    assert.equal(r.summary.improved, 8)
    assert.ok(r.gates.every(g => g.pass))
  })
  test('paired scores match by case ID, not row position', () => {
    const r = candidate(result())
    assert.deepEqual(r.paired.filter(p => p.delta < 0).map(p => [p.caseId, p.delta]), [['r-exact-code', -30], ['r-no-answer', -5]])
    const f = changed(f => { f.baseline.records.reverse(); f.candidates.forEach(c => c.records.reverse()) })
    assert.deepEqual(evaluate(f), result())
  })
  test('replay and holdout-role denominators remain visible and separate', () => {
    const r = candidate(result())
    const [replay, holdout] = r.bySplit
    assert.deepEqual([replay.count, replay.baselineScoreTotal, replay.candidateScoreTotal], [6, 410, 528])
    assert.deepEqual([holdout.count, holdout.baselineScoreTotal, holdout.candidateScoreTotal], [2, 140, 175])
    assert.equal(holdout.meanGain, 17.5)
    assert.deepEqual(result().splitAudit, { development: 2, calibration: 8, replay: 6, holdoutRole: 2, uniqueCaseIds: 18, familyIdsDisjoint: true, heldoutGeneralizationClaim: false, note: 'Split names demonstrate workflow routing only; all samples and rules were co-designed and are public. Family IDs cannot detect semantic leakage.' })
  })
  test('calibration hand calculation and fixed tie-break', () => {
    const c = result().calibration
    assert.equal(c.chosenThreshold, 70)
    assert.deepEqual(c.candidates.map(r => [r.threshold, r.counts.trueAccept, r.counts.falseAccept, r.counts.trueReject, r.counts.falseReject, r.weightedError]), [[50, 4, 2, 2, 0, 4], [70, 3, 1, 3, 1, 3], [90, 1, 0, 4, 3, 3]])
    assert.equal(c.candidates[1].agreement, 0.75)
    assert.equal(c.candidates[1].acceptPrecision, 0.75)
    assert.equal(c.candidates[1].acceptRecall, 0.75)
    assert.deepEqual(c.residualFalseAcceptIds, ['cal-fluent-wrong'])
    assert.deepEqual(c.residualFalseRejectIds, ['cal-terse'])
  })
  test('threshold comparison includes the exact boundary', () => {
    const f = copy(); f.calibration[0].simulatedJudgeScore = 70
    const c = fitThreshold(f.calibration, f.policy.calibration).candidates.find(c => c.threshold === 70)
    assert.ok(c.trueAcceptIds.includes('cal-exact'))
  })
  test('empty predicted-positive denominator produces null precision', () => {
    const f = copy(); f.calibration.forEach(r => { r.simulatedJudgeScore = 0 })
    const c = fitThreshold(f.calibration, { ...f.policy.calibration, thresholdCandidates: [100] })
    assert.equal(c.candidates[0].acceptPrecision, null)
    assert.equal(c.candidates[0].acceptRecall, 0)
    assert.equal(c.candidates[0].counts.falseReject, 4)
  })
  test('score/class and threshold order do not change fitted threshold', () => {
    const f = copy(); f.calibration.reverse(); f.policy.calibration.thresholdCandidates.reverse()
    assert.deepEqual(fitThreshold(f.calibration, f.policy.calibration), result().calibration)
  })
  test('fitting API has no access to replay or holdout data', () => {
    const f = copy()
    for (const key of ['queries', 'baseline', 'candidates', 'development']) Object.defineProperty(f, key, { get() { throw new Error(`leaked ${key}`) } })
    assert.deepEqual(fitThreshold(f.calibration, f.policy.calibration), result().calibration)
  })
  test('release and development mutations cannot tune the calibration result', () => {
    const f = changed(f => {
      f.development.forEach(r => { r.simulatedJudgeScore = 100 - r.simulatedJudgeScore; r.referenceLabel = !r.referenceLabel })
      f.baseline.records.forEach(r => { r.simulatedJudgeScore = 0 })
      f.candidates.forEach(c => c.records.forEach(r => { r.simulatedJudgeScore = 100 }))
    })
    assert.deepEqual(evaluate(f).calibration, result().calibration)
  })
  test('calibration does respond to calibration labels rather than a hard-coded 70', () => {
    const f = copy(); f.calibration.find(r => r.id === 'cal-fluent-wrong').referenceLabel = true
    const c = fitThreshold(f.calibration, f.policy.calibration)
    assert.equal(c.chosenThreshold, 70)
    assert.equal(c.chosenWeightedError, 1)
    f.calibration.find(r => r.id === 'cal-terse').simulatedJudgeScore = 100
    f.calibration.find(r => r.id === 'cal-complete').simulatedJudgeScore = 95
    f.calibration.find(r => r.id === 'cal-fluent-wrong').referenceLabel = false
    assert.equal(fitThreshold(f.calibration, f.policy.calibration).chosenThreshold, 90)
  })
  test('uncited forbidden context is still an ACL violation', () => {
    const r = candidate(result()).paired.find(p => p.caseId === 'r-tenant-boundary')
    assert.deepEqual(r.candidateSignals.forbiddenContextDocumentIds, ['tenant-b-private'])
    assert.deepEqual(r.candidateSignals.forbiddenCitationDocumentIds, [])
    assert.equal(r.delta, 8)
  })
  test('forbidden citation is separately identified', () => {
    const f = changed(f => { record(f, 'r-tenant-boundary').citationDocumentIds.push('tenant-b-private') })
    const p = candidate(evaluate(f)).paired.find(p => p.caseId === 'r-tenant-boundary')
    assert.deepEqual(p.candidateSignals.forbiddenCitationDocumentIds, ['tenant-b-private'])
  })
  test('ACL gate is absolute, not merely better than an unsafe baseline', () => {
    const f = changed(f => { f.baseline.records.find(r => r.caseId === 'r-tenant-boundary').contextDocumentIds.push('tenant-b-private') })
    const r = candidate(evaluate(f))
    assert.equal(gate(r, 'context-and-citation-acl').pass, false)
    assert.deepEqual(r.paired.find(p => p.caseId === 'r-tenant-boundary').baselineSignals.forbiddenContextDocumentIds, ['tenant-b-private'])
  })
  test('perfect simulated scores cannot override forbidden context', () => {
    const f = changed(f => { named(f).records.forEach(r => { r.simulatedJudgeScore = 100 }) })
    const r = candidate(evaluate(f))
    assert.equal(gate(r, 'paired-critical-regressions').pass, true)
    assert.equal(gate(r, 'context-and-citation-acl').pass, false)
    assert.equal(r.decision, 'BLOCK')
  })
  test('perfect simulated scores cannot override required abstention', () => {
    const f = changed(f => { record(f, 'r-no-answer', 'clean-contrast').responseMode = 'answer'; record(f, 'r-no-answer', 'clean-contrast').simulatedJudgeScore = 100 })
    const r = candidate(evaluate(f), 'clean-contrast')
    assert.deepEqual(r.blockingGateIds, ['required-abstention'])
  })
  test('answer text is not a semantic classifier or permission verifier', () => {
    const f = changed(f => { record(f, 'r-two-facts', 'clean-contrast').answer = 'A deliberately wrong sentence; metadata are unchanged.' })
    assert.equal(candidate(evaluate(f), 'clean-contrast').decision, 'PASS_DEMO_POLICY')
    assert.notEqual(JSON.stringify(f), JSON.stringify(original))
  })
  test('empty context is valid metadata, not proof of a supported answer', () => {
    const f = changed(f => {
      const r = record(f, 'r-two-facts', 'clean-contrast')
      r.contextDocumentIds = []; r.citationDocumentIds = []
    })
    assert.equal(candidate(evaluate(f), 'clean-contrast').decision, 'PASS_DEMO_POLICY')
  })
  test('allowlist tampering demonstrates the trusted-input limitation', () => {
    const f = changed(f => { f.queries.find(q => q.id === 'r-tenant-boundary').allowedDocumentIds.push('tenant-b-private') })
    assert.equal(gate(candidate(evaluate(f)), 'context-and-citation-acl').pass, true)
    assert.notEqual(serialize(evaluate(f)), readFileSync(join(root, 'results.json'), 'utf8'))
  })
  test('critical gate is independently sufficient after other problems are removed', () => {
    const f = changed(f => {
      const clean = named(f, 'clean-contrast')
      named(f).records = structuredClone(clean.records)
      record(f, 'r-exact-code').simulatedJudgeScore = 89
    })
    const r = candidate(evaluate(f))
    assert.deepEqual(r.blockingGateIds, ['paired-critical-regressions'])
  })
  test('mean gain equality passes and one point below blocks', () => {
    const f = changed(f => {
      named(f, 'clean-contrast').records = f.baseline.records.map(r => ({ ...structuredClone(r), simulatedJudgeScore: r.simulatedJudgeScore + 5 }))
    })
    assert.equal(candidate(evaluate(f), 'clean-contrast').decision, 'PASS_DEMO_POLICY')
    record(f, 'r-two-facts', 'clean-contrast').simulatedJudgeScore--
    assert.deepEqual(candidate(evaluate(f), 'clean-contrast').blockingGateIds, ['aggregate-judge-uplift'])
  })
  test('noncritical loss can pass this particular policy and is still reported', () => {
    const f = changed(f => { record(f, 'r-two-facts', 'clean-contrast').simulatedJudgeScore = 39 })
    const r = candidate(evaluate(f), 'clean-contrast')
    assert.equal(r.decision, 'PASS_DEMO_POLICY')
    assert.equal(r.summary.regressed, 1)
    assert.equal(r.paired.find(p => p.caseId === 'r-two-facts').delta, -1)
  })
  test('unexpected abstention is a diagnostic, not a hidden extra release gate', () => {
    const f = changed(f => { record(f, 'r-two-facts', 'clean-contrast').responseMode = 'abstain' })
    const r = candidate(evaluate(f), 'clean-contrast')
    assert.equal(r.paired.find(p => p.caseId === 'r-two-facts').candidateSignals.unexpectedAbstention, true)
    assert.equal(r.decision, 'PASS_DEMO_POLICY')
  })
  test('threshold acceptance-rate gate can independently block', () => {
    const f = changed(f => { f.policy.minimumAcceptedRateDelta = 1 })
    const r = candidate(evaluate(f), 'clean-contrast')
    assert.deepEqual(r.blockingGateIds, ['calibrated-acceptance-rate'])
  })
  test('decimal-rational acceptance boundaries, including scientific notation', () => {
    assert.equal(rateAtLeast(7, 100, 0.07), true)
    assert.equal(rateAtLeast(6, 100, 0.07), false)
    assert.equal(rateAtLeast(1, 10_000_000, 1e-7), true)
    assert.equal(rateAtLeast(0, 10_000_000, 1e-7), false)
    assert.equal(rateAtLeast(1, 3, 0.333333333333), true)
    assert.equal(rateAtLeast(1, 3, 0.333333333334), false)
    assert.equal(rateAtLeast(-1, 100, 0), false)
    assert.equal(rateAtLeast(0, 100, 0), true)
    assert.equal(rateAtLeast(100, 100, 1), true)
    assert.equal(rateAtLeast(0, 1, Number.MIN_VALUE), false)
    assert.equal(rateAtLeast(1, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE), true)
    assert.throws(() => rateAtLeast(0, 0, 0), /rate denominator/)
  })
  test('100-pair release: exactly seven added accepts meets 0.07; six does not', () => {
    const f = copy(), q = f.queries[1], b = f.baseline.records[1], c = named(f).records[1]
    f.policy.minimumMeanGain = 0; f.policy.minimumAcceptedRateDelta = 0.07
    f.queries = []; f.baseline.records = []; f.candidates = [{ name: 'rate-boundary', contract: structuredClone(f.contract), records: [] }]
    for (let i = 0; i < 100; i++) {
      const id = `rate-case-${i}`, mode = i === 0 ? 'abstain' : 'answer'
      f.queries.push({ ...structuredClone(q), id, familyId: `rate-family-${i}`, critical: i === 0, requiredMode: mode, split: i % 2 ? 'replay' : 'holdout-role' })
      f.baseline.records.push({ ...structuredClone(b), caseId: id, simulatedJudgeScore: 60, responseMode: mode })
      f.candidates[0].records.push({ ...structuredClone(c), caseId: id, simulatedJudgeScore: i < 7 ? 70 : 60, responseMode: mode })
    }
    const atBoundary = evaluate(f).candidates[0]
    assert.equal(atBoundary.summary.acceptedRateDelta, 0.07)
    assert.equal(atBoundary.decision, 'PASS_DEMO_POLICY')
    f.candidates[0].records[6].simulatedJudgeScore = 60
    assert.deepEqual(evaluate(f).candidates[0].blockingGateIds, ['calibrated-acceptance-rate'])
  })
  test('documents, queries, candidates and records can be permuted deterministically', () => {
    const f = changed(f => {
      f.documents.reverse(); f.queries.reverse(); f.development.reverse(); f.calibration.reverse(); f.candidates.reverse()
      f.baseline.records.reverse(); f.candidates.forEach(c => c.records.reverse())
      f.queries.forEach(q => q.allowedDocumentIds.reverse())
      for (const r of [f.baseline, ...f.candidates]) r.records.forEach(row => { row.contextDocumentIds.reverse(); row.citationDocumentIds.reverse() })
    })
    assert.deepEqual(evaluate(f), result())
  })

  const rejectionCases = [
    ['missing candidate row', f => named(f).records.pop(), /missing\/unpaired/],
    ['missing baseline row', f => f.baseline.records.pop(), /missing\/unpaired/],
    ['duplicate candidate row', f => named(f).records.push(structuredClone(named(f).records[0])), /duplicate record/],
    ['duplicate baseline row', f => f.baseline.records.push(structuredClone(f.baseline.records[0])), /duplicate record/],
    ['unknown case pairing', f => { named(f).records[0].caseId = 'not-a-query' }, /unknown\/unpaired/],
    ['calibration row used as release record', f => { named(f).records[0].caseId = 'cal-exact' }, /unknown\/unpaired/],
    ['missing score', f => { delete named(f).records[0].simulatedJudgeScore }, /missing or unknown fields/],
    ['null score', f => { named(f).records[0].simulatedJudgeScore = null }, /must be an integer/],
    ['string score', f => { named(f).records[0].simulatedJudgeScore = '95' }, /must be an integer/],
    ['NaN score', f => { named(f).records[0].simulatedJudgeScore = NaN }, /must be an integer/],
    ['infinite score', f => { named(f).records[0].simulatedJudgeScore = Infinity }, /must be an integer/],
    ['fractional score', f => { named(f).records[0].simulatedJudgeScore = 95.5 }, /must be an integer/],
    ['out of range score', f => { named(f).records[0].simulatedJudgeScore = 101 }, /must be an integer/],
    ['spoofed ACL pass flag', f => { named(f).records[0].aclPassed = true }, /missing or unknown fields/],
    ['missing context', f => { delete named(f).records[0].contextDocumentIds }, /missing or unknown fields/],
    ['missing response mode', f => { delete named(f).records[0].responseMode }, /missing or unknown fields/],
    ['invalid response mode', f => { named(f).records[0].responseMode = 'unknown' }, /invalid responseMode/],
    ['unknown context document', f => { named(f).records[0].contextDocumentIds.push('unknown') }, /unknown contextDocumentIds/],
    ['duplicate context document', f => { named(f).records[0].contextDocumentIds.push('retry-v1') }, /duplicate contextDocumentIds/],
    ['duplicate citation', f => { named(f).records[0].citationDocumentIds.push('retry-v1') }, /duplicate citationDocumentIds/],
    ['citation outside context', f => { named(f).records[0].citationDocumentIds.push('logs-v1') }, /citation absent from context/],
    ['duplicate allowed document', f => f.queries[0].allowedDocumentIds.push('retry-v1'), /duplicate allowedDocumentIds/],
    ['unknown allowed document', f => f.queries[0].allowedDocumentIds.push('missing'), /unknown allowed document/],
    ['duplicate document', f => f.documents.push(structuredClone(f.documents[0])), /duplicate document/],
    ['duplicate query ID', f => { f.queries[1].id = f.queries[0].id }, /duplicate case id/],
    ['family leakage across roles', f => { f.queries[0].familyId = f.calibration[0].familyId }, /duplicate familyId/],
    ['case ID leakage across roles', f => { f.calibration[0].id = f.development[0].id }, /duplicate case id/],
    ['missing holdout-role denominator', f => f.queries.forEach(q => { q.split = 'replay' }), /missing holdout-role/],
    ['missing replay denominator', f => f.queries.forEach(q => { q.split = 'holdout-role' }), /missing replay/],
    ['empty calibration denominator', f => { f.calibration = [] }, /calibration must be an array/],
    ['empty development role', f => { f.development = [] }, /development must be an array/],
    ['single-class calibration', f => f.calibration.forEach(r => { r.referenceLabel = true }), /both synthetic label classes/],
    ['nonboolean reference assignment', f => { f.calibration[0].referenceLabel = 'true' }, /must be boolean/],
    ['empty candidate set', f => { f.candidates = [] }, /candidates must be an array/],
    ['duplicate run names', f => { f.candidates[0].name = f.baseline.name }, /duplicate run name/],
    ['mismatched judge version', f => { f.candidates[0].contract.judgeVersion = 'other-judge' }, /run contract mismatch/],
    ['mismatched snapshot', f => { f.baseline.contract.knowledgeSnapshot = 'other-snapshot' }, /run contract mismatch/],
    ['missing version field', f => { delete f.candidates[0].contract.rubricVersion }, /missing or unknown fields/],
    ['missing critical label', f => { delete f.queries[0].critical }, /missing or unknown fields/],
    ['nonboolean critical label', f => { f.queries[0].critical = 1 }, /critical must be boolean/],
    ['no critical coverage', f => f.queries.forEach(q => { q.critical = false }), /missing critical query coverage/],
    ['no abstention coverage', f => f.queries.forEach(q => { q.requiredMode = 'answer' }), /missing abstention query coverage/],
    ['empty threshold grid', f => { f.policy.calibration.thresholdCandidates = [] }, /thresholdCandidates must be an array/],
    ['duplicate thresholds', f => { f.policy.calibration.thresholdCandidates = [70, 70] }, /duplicate threshold/],
    ['threshold out of range', f => { f.policy.calibration.thresholdCandidates = [101] }, /threshold must be an integer/],
    ['zero false-accept cost', f => { f.policy.calibration.falseAcceptCost = 0 }, /falseAcceptCost must be an integer/],
    ['unsupported tie-break', f => { f.policy.calibration.tieBreak = 'inspect-holdout' }, /unsupported threshold tieBreak/],
    ['invalid rate threshold', f => { f.policy.minimumAcceptedRateDelta = 1.1 }, /invalid minimumAcceptedRateDelta/],
    ['unscoped production policy', f => { f.policy.scope = 'production-recommendation' }, /policy scope/],
    ['unsupported schema', f => { f.schemaVersion = 2 }, /unsupported schemaVersion/],
    ['top-level extra field', f => { f.releaseApproved = true }, /missing or unknown fields/]
  ]
  for (const [name, mutation, pattern] of rejectionCases) test(`fail closed: ${name}`, () => invalid(mutation, pattern))

  test('repeated calls are deterministic and do not mutate inputs', () => {
    const f = copy(), before = JSON.stringify(f)
    assert.deepEqual(evaluate(f), evaluate(f))
    assert.equal(JSON.stringify(f), before)
    assert.equal(validateFixture(f), f)
  })
  test('published JSON is exact recomputed output, not rewritten by tests', () => {
    const expected = readFileSync(join(root, 'results.json'), 'utf8')
    assert.deepEqual(JSON.parse(expected), result())
    assert.equal(serialize(result()), expected)
  })
  test('CLI default is reproducible report mode, not release approval', () => {
    const p = cli([join(root, 'fixture.json')])
    assert.equal(p.status, 0); assert.equal(p.stderr, '')
    assert.equal(p.stdout, readFileSync(join(root, 'results.json'), 'utf8'))
    assert.equal(candidate(JSON.parse(p.stdout)).decision, 'BLOCK')
  })
  test('CLI named-candidate gate uses exit 2 for block and 0 for pass', () => {
    for (const [name, status] of [['unsafe-uplift', 2], ['clean-contrast', 0]]) {
      const p = cli([join(root, 'fixture.json'), '--candidate', name])
      assert.equal(p.status, status); assert.equal(p.stderr, '')
      const r = JSON.parse(p.stdout); assert.equal(r.candidates.length, 1); assert.equal(r.candidates[0].name, name)
    }
  })
  test('CLI unknown candidate, usage error, malformed JSON and invalid pair fail with no report', () => {
    const temp = mkdtempSync(join(tmpdir(), 'rag-release-invalid-'))
    try {
      const badJSON = join(temp, 'bad.json'), badPair = join(temp, 'unpaired.json')
      writeFileSync(badJSON, '{')
      writeFileSync(badPair, JSON.stringify(changed(f => named(f).records.pop())))
      for (const args of [[], [join(root, 'fixture.json'), '--candidate'], [join(root, 'fixture.json'), '--candidate', 'unknown'], [badJSON], [badPair]]) {
        const p = cli(args)
        assert.equal(p.status, 1); assert.equal(p.stdout, ''); assert.match(p.stderr, /Invalid release input/)
      }
    } finally { rmSync(temp, { recursive: true, force: true }) }
  })
  test('four downloaded files execute and test independently outside the repository', () => {
    // Avoid recursion only in the copied self-test, never skip ordinary assertions.
    if (process.env.RAG_RELEASE_STANDALONE_CHILD === '1') return
    const temp = mkdtempSync(join(tmpdir(), 'rag-release-standalone-'))
    try {
      for (const name of ['evaluate.mjs', 'fixture.json', 'results.json', 'test.mjs']) cpSync(join(root, name), join(temp, name))
      const p = spawnSync(process.execPath, ['evaluate.mjs', 'fixture.json'], { cwd: temp, encoding: 'utf8' })
      assert.equal(p.status, 0); assert.equal(p.stderr, '')
      assert.equal(p.stdout, readFileSync(join(root, 'results.json'), 'utf8'))
      const t = spawnSync(process.execPath, ['test.mjs'], { cwd: temp, encoding: 'utf8', env: { ...process.env, RAG_RELEASE_STANDALONE_CHILD: '1' } })
      assert.equal(t.status, 0, t.stderr); assert.match(t.stdout, /RAG release tests passed/)
    } finally { rmSync(temp, { recursive: true, force: true }) }
  })
  return `RAG release tests passed: ${passed.length}`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(runTests())

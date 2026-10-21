import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { evaluate, recallAtK } from '../../public/examples/rag-evaluation/evaluate.mjs'

const fixture = JSON.parse(await fs.readFile(new URL('../../public/examples/rag-evaluation/fixture.json', import.meta.url), 'utf8'))
const baseline = evaluate(fixture, fixture.runs[0])
const corrected = evaluate(fixture, fixture.runs[1])
assert.equal(baseline.summary.macroEvidenceRecall, 0.5)
assert.equal(baseline.summary.macroReferenceFactCoverage, 0.5)
assert.equal(baseline.summary.microSupportedClaimRate, 0.75)
assert.equal(baseline.summary.citationPresenceAndValidity, 0.75)
assert.equal(baseline.summary.correctAbstentionRate, 0)
assert.equal(baseline.summary.falseAbstentionRate, 0)
assert.equal(corrected.summary.macroEvidenceRecall, 1)
assert.equal(corrected.summary.macroReferenceFactCoverage, 1)
assert.equal(corrected.summary.microSupportedClaimRate, 1)
assert.equal(corrected.summary.correctAbstentionRate, 1)
assert.equal(corrected.rows[3].evidenceRecall, null)
assert.equal(corrected.rows[3].supportedClaimRate, null)
assert.equal(baseline.rows[2].supportedClaimRate, 1, 'Faithfulness alone must not prove current factual correctness')
assert.equal(baseline.rows[2].referenceFactCoverage, 0)
assert.equal(recallAtK(['a', 'b'], ['b', 'c', 'a'], 2), 0.5)
assert.equal(recallAtK(['a', 'b'], ['b', 'c', 'a'], 3), 1)
assert.equal(recallAtK([], [], 2), null)
assert.throws(() => recallAtK(['a'], ['a', 'a'], 2), /duplicate/)
for (const k of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => evaluate(fixture, fixture.runs[0], k), /positive integer/)

const mutateRun = (mutator) => {
  const run = structuredClone(fixture.runs[1])
  mutator(run)
  return run
}
assert.throws(() => evaluate(fixture, mutateRun((run) => run.results.pop())), /every case/)
assert.throws(() => evaluate(fixture, mutateRun((run) => run.results.push(run.results[0]))), /duplicate/)
assert.throws(() => evaluate(fixture, mutateRun((run) => run.results[0].retrievedIds.push('unknown'))), /unknown retrieved/)
assert.throws(() => evaluate(fixture, mutateRun((run) => run.results[0].review.coveredReferenceFactIds.push('unknown'))), /unknown covered/)
assert.throws(() => evaluate(fixture, mutateRun((run) => run.results[0].abstained = true)), /abstention cannot/)
assert.throws(() => evaluate(fixture, mutateRun((run) => run.results[0].claims[0].review.supportedByIds = ['retention-v1'])), /top-k context/)
const wrongCitation = evaluate(fixture, mutateRun((run) => run.results[0].claims[0].citationIds = ['does-not-exist']))
assert.equal(wrongCitation.summary.citationPresenceAndValidity, 0.75)
assert.equal(wrongCitation.summary.microSupportedClaimRate, 1, 'Citation validity and support are separate measurements')
const refuseAll = mutateRun((run) => {
  for (const result of run.results) {
    result.abstained = true
    result.answer = '无法回答。'
    result.claims = []
    result.review.coveredReferenceFactIds = []
  }
})
const refusal = evaluate(fixture, refuseAll)
assert.equal(refusal.summary.microSupportedClaimRate, null, 'Empty claims cannot be awarded a perfect score')
assert.equal(refusal.summary.macroReferenceFactCoverage, 0)
assert.equal(refusal.summary.falseAbstentionRate, 1, 'Refusing everything must not look successful')

const article = await fs.readFile(new URL('../../content/posts/rag-evaluation-01-evidence-to-answer.mdx', import.meta.url), 'utf8')
assert.match(article, /published: true/)
assert.match(article, /- RAG/)
assert.match(article, /合成教学样例/)
assert.match(article, /没有调用真实检索器或大模型/)
for (const filename of ['evaluate.mjs', 'fixture.json']) {
  assert.ok(article.includes(`/examples/rag-evaluation/${filename}`), `Missing public download link: ${filename}`)
}
console.log('RAG 教学评测回归通过：合成样例、空分母、top-k、重复/缺失数据、过期证据、无效引用与过度拒答。')

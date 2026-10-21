import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditSelection, auditArchive, parseJsonStrict, parseCitationMarkers } from './audit.mjs';
import { download } from './download.mjs';
import { SOURCE, SOURCE_URL, DEFAULT_INPUT, verifySourceBytes } from './source.mjs';

// These invented strings and labels test arithmetic and failure modes. They are
// not new model outputs, human annotations, or a miniature research benchmark.
function sentence(text, human, automatic, edges = [], autoEdges = edges) {
  return { text, human, automatic, edges, autoEdges };
}
function record(id, rows) {
  return {
    id, question: 'Synthetic unit-test question', output: rows.map(row => row.text).join(' '),
    overall_recall_score: rows.length ? rows.reduce((n, row) => n + row.human, 0) / rows.length : 0,
    overall_precision_score: 0,
    sentences: rows.map(row => ({ text: row.text, sentence_recall_score: row.human, sentence_precision_score: row.human,
      citations: row.edges.map(edge => ({ title: 'Synthetic document', text: 'Synthetic test-only evidence', citation_precision_score: edge })) })),
    automatic_recall_scores: rows.map(row => row.automatic),
    automatic_precision_scores: rows.map(row => row.automatic),
    automatic_citation_precision_scores: rows.map(row => [...row.autoEdges]),
  };
}
function fixture() {
  return {
    a: record('a', [sentence('Synthetic A [1].', 1, 1, [2])]),
    b: record('b', [sentence('Synthetic B [1].', 0, 1, [1]), sentence('Synthetic C [1][2].', 1, 0, [2, 1], [0, 0]), sentence('Synthetic uncited D.', 0, 0)]),
    c: record('c', []),
    overall_results: { citation_rec: 999999, citation_prec: -999999 },
  };
}
const approximately = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('independent sentence, question, cited-sentence and citation denominators', () => {
  const r = auditSelection(fixture());
  assert.equal(r.counts.questions, 3);
  assert.equal(r.counts.sentences, 4);
  assert.equal(r.counts.scoredCitationOccurrences, 4);
  assert.deepEqual(r.sentenceSupport.humanMicro, { numerator: 2, denominator: 4, rate: 0.5 });
  approximately(r.sentenceSupport.humanEqualQuestionMacro.rate, 4 / 9);
  approximately(r.scoredCitationLabels.upstreamAcceptedHumanEqualQuestionMacro.rate, 5 / 9);
  assert.deepEqual(r.scoredCitationLabels.upstreamAcceptedHumanMicro, { numerator: 3, denominator: 4, rate: 0.75 });
  assert.deepEqual(r.scoredCitationLabels.upstreamAcceptedAutomaticMicro, { numerator: 2, denominator: 4, rate: 0.5 });
  assert.deepEqual(r.scoredCitationLabels.humanRaw, { none: 0, partial: 2, full: 2 });
  assert.deepEqual(r.structuralCoverage.citedButHumanNotFullySupported, { numerator: 1, denominator: 3, rate: 1 / 3 });
  assert.equal(r.sentenceSupport.entirelyHumanSupportedAnswers.numerator, 1);
  assert.deepEqual(r.confusion.sentenceSupport.matrix, [[1, 1], [1, 1]]);
  assert.deepEqual(r.confusion.citationAcceptance.matrix, [[0, 1], [2, 1]]);
});

test('reordering equal-shaped sentence units fails output alignment', () => {
  const x = record('x', [sentence('First synthetic [1].', 1, 1, [2]), sentence('Second synthetic [2].', 1, 1, [2])]);
  x.sentences.reverse();
  assert.throws(() => auditSelection({ x }), /text alignment mismatch/);
});

test('empty outputs remain zero-scored questions, never vacuous full-support successes', () => {
  const r = auditSelection({ empty: record('empty', []) });
  assert.equal(r.counts.emptyOutputs, 1);
  assert.equal(r.sentenceSupport.humanEqualQuestionMacro.rate, 0);
  assert.equal(r.sentenceSupport.humanMicro.rate, null);
  assert.equal(r.scoredCitationLabels.upstreamAcceptedHumanMicro.rate, null);
  assert.equal(r.sentenceSupport.entirelyHumanSupportedAnswers.numerator, 0);
});

test('an empty selection fails rather than reporting a fabricated zero', () => {
  assert.throws(() => auditSelection({}), /empty record collection/);
});

test('partial labels count only after sentence recall gating; no label repair', () => {
  const r = auditSelection({ x: record('x', [sentence('Synthetic contradiction [1][2][3].', 0, 1, [2, 1, 0], [2, 1, 0])]) });
  assert.equal(r.scoredCitationLabels.humanRawFull.numerator, 1);
  assert.equal(r.scoredCitationLabels.upstreamAcceptedHumanMicro.numerator, 0);
  assert.equal(r.scoredCitationLabels.upstreamAcceptedAutomaticMicro.numerator, 2);
  assert.equal(r.sampleRecordIds.fullEdgeInNotFullySupportedSentence.length, 1);
});

test('four/five markers permit exactly three archived scores and expose truncation', () => {
  const r = auditSelection({ x: record('x', [sentence('Synthetic [1][2][3][4][5].', 1, 1, [2, 1, 0])]) });
  assert.equal(r.counts.numericCitationOccurrences, 5);
  assert.equal(r.counts.scoredCitationOccurrences, 3);
  assert.equal(r.counts.unscoredNumericCitationOccurrences, 2);
  assert.equal(r.counts.sentencesAboveThreeOccurrenceCap, 1);
});

test('repeated citation IDs remain occurrences and are reported, not silently deduplicated', () => {
  const r = auditSelection({ x: record('x', [sentence('Synthetic [1][1][2].', 1, 1, [2, 1, 2])]) });
  assert.equal(r.counts.scoredCitationOccurrences, 3);
  assert.equal(r.counts.repeatedNumericCitationOccurrences, 1);
});

test('regex presence is never semantic support; nonnumeric brackets are not citations', () => {
  const r = auditSelection({ x: record('x', [sentence('Synthetic [1].', 0, 0, [0]), sentence('Synthetic [Irrelevant].', 0, 0)]) });
  assert.equal(r.structuralCoverage.sentenceNumericCitationPresence.numerator, 1);
  assert.equal(r.sentenceSupport.humanMicro.numerator, 0);
  assert.deepEqual(parseCitationMarkers('No numeric marker [Irrelevant].'), []);
});

test('inherited citation-only units and duplicate sentence texts are counted explicitly', () => {
  const r = auditSelection({ x: record('x', [sentence('[1].', 1, 1, [2]), sentence('[1].', 1, 1, [2])]) });
  assert.equal(r.counts.citationOnlySentenceUnits, 2);
  assert.equal(r.counts.repeatedSentenceTextsWithinQuestions, 1);
});

const mutations = [
  ['missing sentences', f => delete f.a.sentences, /expected array/],
  ['missing citations', f => delete f.a.sentences[0].citations, /expected array/],
  ['missing automatic recall', f => delete f.a.automatic_recall_scores, /expected array/],
  ['missing automatic precision', f => delete f.a.automatic_precision_scores, /expected array/],
  ['missing automatic citation array', f => delete f.a.automatic_citation_precision_scores, /expected array/],
  ['missing nested automatic citation array', f => f.a.automatic_citation_precision_scores[0] = null, /expected array/],
  ['missing citation document text', f => delete f.a.sentences[0].citations[0].text, /expected string/],
  ['unknown human recall label', f => f.a.sentences[0].sentence_recall_score = 2, /unknown label/],
  ['string human edge label', f => f.a.sentences[0].citations[0].citation_precision_score = '2', /unknown label/],
  ['unknown human edge label', f => f.a.sentences[0].citations[0].citation_precision_score = 3, /unknown label/],
  ['unknown auto edge label', f => f.a.automatic_citation_precision_scores[0][0] = -1, /unknown label/],
  ['boolean auto recall label', f => f.a.automatic_recall_scores[0] = true, /unknown label/],
  ['unknown automatic precision label', f => f.a.automatic_precision_scores[0] = 9, /unknown label/],
  ['nonfinite summary label', f => f.a.overall_recall_score = NaN, /finite number/],
  ['mismatched sentence arrays', f => f.a.automatic_recall_scores.push(1), /length mismatch/],
  ['mismatched edge arrays', f => f.a.automatic_citation_precision_scores[0].push(1), /length mismatch/],
  ['sparse sentence array', f => delete f.a.sentences[0], /sparse array/],
  ['empty output with sentences', f => f.a.output = '', /empty output/],
  ['nonempty output without annotations', f => f.c.output = 'Unannotated output', /empty output/],
  ['empty annotated sentence', f => f.a.sentences[0].text = ' ', /empty annotated sentence/],
  ['duplicate record ID', f => f.b.id = 'a', /duplicate record ID/],
  ['record key and ID disagreement', f => f.a.id = 'other', /key\/ID mismatch/],
  ['out-of-range marker', f => f.a.sentences[0].text = 'Synthetic [6].', /outside selected ndoc5 range/],
  ['zero marker', f => f.a.sentences[0].text = 'Synthetic [0].', /outside selected ndoc5 range/],
  ['unclosed numeric marker', f => f.a.sentences[0].text = 'Synthetic [1.', /malformed numeric/],
  ['comma-group marker', f => f.a.sentences[0].text = 'Synthetic [1, 2].', /malformed numeric/],
  ['space marker', f => f.a.sentences[0].text = 'Synthetic [ 1 ].', /malformed numeric/],
  ['replaced sentence text', f => f.a.sentences[0].text = 'Replacement synthetic [1].', /text alignment mismatch/],
  ['reordered sentence text', f => [f.b.sentences[0], f.b.sentences[1]] = [f.b.sentences[1], f.b.sentences[0]], /length mismatch|text alignment mismatch/],
  ['unannotated output suffix', f => f.a.output += ' Extra unannotated content.', /text alignment mismatch/],
  ['citation parse mismatch', f => f.a.sentences[0].text = 'Synthetic [1][2].', /scored citation count mismatch/],
  ['missing numeric marker with a scored edge', f => f.a.sentences[0].text = 'Synthetic plain text.', /scored citation count mismatch/],
  ['truncation is not an arbitrary skip allowance', f => f.a.sentences[0].text = 'Synthetic [1][2][3][4].', /scored citation count mismatch/],
];
for (const [name, mutate, expected] of mutations) {
  test(`fail closed: ${name}`, () => {
    const data = fixture(); mutate(data);
    assert.throws(() => auditSelection(data), expected);
  });
}

test('strict JSON rejects duplicate keys including escaped aliases; does not confuse string content', () => {
  assert.throws(() => parseJsonStrict('{"a":1,"a":2}'), /duplicate JSON key/);
  assert.throws(() => parseJsonStrict('{"outer":{"a":1,"\\u0061":2}}'), /duplicate JSON key/);
  const text = '{"x":[{"s":"quoted \\\" and braces {}"},true,null,-2.3],"y":[]}';
  assert.deepEqual(parseJsonStrict(text), JSON.parse(text));
});

test('integrity check refuses a modified source before any metric computation', () => {
  assert.throws(() => verifySourceBytes(Buffer.from('{}')), /Source integrity mismatch/);
  assert.throws(() => auditArchive(Buffer.from('{}')), /Source integrity mismatch/);
});

test('failed or corrupt downloads never replace existing local data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-audit-test-'));
  const destination = join(directory, 'source.json');
  try {
    await writeFile(destination, 'previous file');
    let seenUrl;
    await assert.rejects(() => download({ destination, fetcher: async url => { seenUrl = url; return { ok: false, status: 503 }; } }), /HTTP 503/);
    assert.equal(seenUrl, SOURCE_URL);
    await assert.rejects(() => download({ destination, fetcher: async () => ({ ok: true, arrayBuffer: async () => Buffer.from('<html>error</html>') }) }), /integrity mismatch/);
    assert.equal(await readFile(destination, 'utf8'), 'previous file');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('published results snapshot contains only aggregate metrics and sample identifiers', async () => {
  const r = JSON.parse(await readFile(new URL('./results.json', import.meta.url), 'utf8'));
  assert.equal(r.provenance.sha256, SOURCE.sha256);
  assert.equal(r.provenance.exactBackendVersion, null);
  assert.equal(r.provenance.generatedHere, false);
  assert.equal(r.counts.questions, 100);
  assert.equal(r.counts.emptyOutputs, 1);
  assert.equal(r.counts.sentences, 236);
  assert.equal(r.counts.numericCitationOccurrences, 306);
  assert.equal(r.counts.scoredCitationOccurrences, 290);
  assert.equal(r.counts.unscoredNumericCitationOccurrences, 16);
  assert.equal(r.counts.citationOnlySentenceUnits, 2);
  assert.equal(r.sentenceDisagreementRecords.length, 31);
  assert.equal(r.sentenceSupport.humanMicro.numerator, 168);
  assert.equal(r.sentenceSupport.automaticMicro.numerator, 171);
  approximately(r.sentenceSupport.humanEqualQuestionMacro.rate, 0.7469166666666667);
  assert.deepEqual(r.scoredCitationLabels.humanRaw, { none: 37, partial: 58, full: 195 });
  assert.equal(r.scoredCitationLabels.upstreamAcceptedHumanMicro.numerator, 228);
  assert.deepEqual(r.confusion.sentenceSupport.matrix, [[51, 17], [14, 154]]);
  assert.deepEqual(r.confusion.citationAcceptance.matrix, [[37, 25], [35, 193]]);
  assert.equal(r.archiveConsistency.storedHumanPrecisionDifferentFromRecomputedQuestionEdgeAcceptance, 33);
  const forbidden = new Set(['output', 'question', 'text', 'title', 'sentences', 'citations']);
  function inspect(value, path = '') {
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      // An integer aggregate count named sentences is allowed, but no source text/arrays.
      assert.ok(!forbidden.has(key) || (key === 'sentences' && Number.isInteger(nested)), `${path}.${key} leaks source field`);
      inspect(nested, `${path}.${key}`);
    }
  }
  inspect(r);
  assert.ok(!DEFAULT_INPUT.includes('/public/'));
});

test('optional real pinned-source integration exactly reproduces checked-in aggregates', {
  skip: !process.env.RAG_CITATION_SOURCE && 'Set RAG_CITATION_SOURCE to the pinned local annotation JSON to run integration',
}, async () => {
  const bytes = await readFile(process.env.RAG_CITATION_SOURCE);
  const expected = JSON.parse(await readFile(new URL('./results.json', import.meta.url), 'utf8'));
  assert.deepEqual(auditArchive(bytes), expected);
  const corrupt = Buffer.from(bytes); corrupt[10] ^= 1;
  assert.throws(() => auditArchive(corrupt), /Source integrity mismatch/);
});

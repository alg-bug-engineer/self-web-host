import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SOURCE, SOURCE_URL, DEFAULT_INPUT, verifySourceBytes } from './source.mjs';

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
function object(value, path) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value), `${path}: expected object`);
}
function array(value, path) {
  requireThat(Array.isArray(value), `${path}: expected array`);
  for (let i = 0; i < value.length; i++) requireThat(Object.hasOwn(value, i), `${path}: sparse array`);
}
function string(value, path) {
  requireThat(typeof value === 'string', `${path}: expected string`);
}
function label(value, allowed, path) {
  requireThat(typeof value === 'number' && allowed.includes(value), `${path}: unknown label ${JSON.stringify(value)}`);
}
function unitInterval(value, path) {
  requireThat(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1, `${path}: expected finite number in [0,1]`);
}
const meanOrZero = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const ratio = (numerator, denominator) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
const macro = values => ({ sumOfQuestionRates: values.reduce((a, b) => a + b, 0), denominator: values.length, rate: meanOrZero(values) });

/** JSON.parse alone silently overwrites duplicate keys; reject them before auditing. */
export function parseJsonStrict(text) {
  const result = JSON.parse(text);
  let cursor = 0;
  function white() { while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++; }
  function tokenString() {
    const start = cursor++;
    while (cursor < text.length) {
      if (text[cursor] === '\\') cursor += 2;
      else if (text[cursor++] === '"') break;
    }
    return JSON.parse(text.slice(start, cursor));
  }
  function value() {
    white();
    if (text[cursor] === '{') {
      cursor++; white();
      const keys = new Set();
      if (text[cursor] === '}') { cursor++; return; }
      while (true) {
        white();
        const key = tokenString();
        requireThat(!keys.has(key), `duplicate JSON key: ${key}`);
        keys.add(key);
        white(); cursor++; // colon, already syntax-checked by JSON.parse
        value(); white();
        if (text[cursor++] === '}') return;
      }
    } else if (text[cursor] === '[') {
      cursor++; white();
      if (text[cursor] === ']') { cursor++; return; }
      while (true) {
        value(); white();
        if (text[cursor++] === ']') return;
      }
    } else if (text[cursor] === '"') {
      tokenString();
    } else {
      while (cursor < text.length && !/[\s,\]}]/.test(text[cursor])) cursor++;
    }
  }
  value();
  return result;
}

/** A structural parser only. Its output must never become an entailment label. */
export function parseCitationMarkers(text, path = 'sentence') {
  const matches = [...text.matchAll(/\[(\d+)\]/g)];
  const ids = matches.map(match => Number(match[1]));
  // Non-numeric brackets such as [Irrelevant] are not numeric citations.
  // A number-starting bracket that is not exactly [digits] is a parse error.
  const withoutValid = text.replace(/\[\d+\]/g, '');
  requireThat(!/\[\s*\d/.test(withoutValid), `${path}: malformed numeric citation marker`);
  for (const id of ids) {
    requireThat(Number.isSafeInteger(id) && id >= 1 && id <= SOURCE.maximumNumericCitationId,
      `${path}: citation ID outside selected ndoc5 range`);
  }
  return ids;
}

export function validateSelection(selection) {
  object(selection, 'selected model');
  const records = [];
  const seenIds = new Set();
  for (const [key, record] of Object.entries(selection)) {
    if (key === 'overall_results') { object(record, key); continue; }
    const path = `record ${key}`;
    object(record, path);
    string(record.id, `${path}.id`);
    requireThat(!seenIds.has(record.id), `${path}: duplicate record ID ${record.id}`);
    seenIds.add(record.id);
    requireThat(record.id === key, `${path}: key/ID mismatch`);
    string(record.question, `${path}.question`);
    string(record.output, `${path}.output`);
    array(record.sentences, `${path}.sentences`);
    unitInterval(record.overall_recall_score, `${path}.overall_recall_score`);
    unitInterval(record.overall_precision_score, `${path}.overall_precision_score`);
    requireThat((record.output.trim().length === 0) === (record.sentences.length === 0),
      `${path}: empty output / sentence annotations disagree`);
    for (const field of ['automatic_recall_scores', 'automatic_precision_scores', 'automatic_citation_precision_scores']) {
      array(record[field], `${path}.${field}`);
      requireThat(record[field].length === record.sentences.length, `${path}.${field}: sentence array length mismatch`);
    }
    record.sentences.forEach((sentence, index) => {
      const sp = `${path}.sentences[${index}]`;
      object(sentence, sp);
      string(sentence.text, `${sp}.text`);
      requireThat(sentence.text.trim().length > 0, `${sp}: empty annotated sentence`);
      array(sentence.citations, `${sp}.citations`);
      label(sentence.sentence_recall_score, [0, 1], `${sp}.sentence_recall_score`);
      label(sentence.sentence_precision_score, [0, 1], `${sp}.sentence_precision_score`);
      label(record.automatic_recall_scores[index], [0, 1], `${path}.automatic_recall_scores[${index}]`);
      label(record.automatic_precision_scores[index], [0, 1], `${path}.automatic_precision_scores[${index}]`);
      const automaticEdges = record.automatic_citation_precision_scores[index];
      array(automaticEdges, `${path}.automatic_citation_precision_scores[${index}]`);
      requireThat(automaticEdges.length === sentence.citations.length, `${sp}: human/automatic citation array length mismatch`);
      const markers = parseCitationMarkers(sentence.text, sp);
      requireThat(sentence.citations.length === Math.min(markers.length, SOURCE.maximumScoredCitationsPerSentence),
        `${sp}: numeric marker / scored citation count mismatch (explicit three-occurrence cap)`);
      sentence.citations.forEach((citation, edgeIndex) => {
        object(citation, `${sp}.citations[${edgeIndex}]`);
        string(citation.title, `${sp}.citations[${edgeIndex}].title`);
        string(citation.text, `${sp}.citations[${edgeIndex}].text`);
        label(citation.citation_precision_score, [0, 1, 2], `${sp}.citations[${edgeIndex}].citation_precision_score`);
        label(automaticEdges[edgeIndex], [0, 1, 2], `${sp}.automatic_citation_precision_scores[${edgeIndex}]`);
      });
    });
    const normalized = text => text.trim().replace(/\s+/g, ' ');
    requireThat(normalized(record.output) === normalized(record.sentences.map(sentence => sentence.text).join(' ')),
      `${path}: output / ordered sentence text alignment mismatch`);
    records.push(record);
  }
  requireThat(records.length > 0, 'selected model: empty record collection');
  return records;
}

function confusion(matrix, unit) {
  const denominator = matrix.flat().reduce((a, b) => a + b, 0);
  return {
    unit, rows: 'human label 0,1', columns: 'archived automatic label 0,1', matrix,
    agreement: ratio(matrix[0][0] + matrix[1][1], denominator),
    disagreement: ratio(matrix[0][1] + matrix[1][0], denominator),
    automaticPositiveHumanNegative: matrix[0][1],
    automaticNegativeHumanPositive: matrix[1][0],
  };
}

/** Accepts one complete model slice. Unit tests use tiny synthetic slices, never source edits. */
export function auditSelection(selection) {
  const records = validateSelection(selection);
  const counts = {
    questions: records.length, nonemptyOutputs: 0, emptyOutputs: 0, questionsWithoutScoredCitations: 0,
    sentences: 0, sentencesWithNumericCitations: 0, sentencesWithoutNumericCitations: 0,
    numericCitationOccurrences: 0, scoredCitationOccurrences: 0, unscoredNumericCitationOccurrences: 0,
    sentencesAboveThreeOccurrenceCap: 0, sentencesWithRepeatedNumericCitationIds: 0,
    repeatedNumericCitationOccurrences: 0, citationOnlySentenceUnits: 0,
    repeatedSentenceTextsWithinQuestions: 0,
  };
  const humanRaw = [0, 0, 0], automaticRaw = [0, 0, 0];
  const rawHumanBySentenceLabel = [[0, 0, 0], [0, 0, 0]];
  const sentenceMatrix = [[0, 0], [0, 0]], edgeMatrix = [[0, 0], [0, 0]];
  let humanSupported = 0, autoSupported = 0, humanEdges = 0, autoEdges = 0;
  let citedHumanUnsupported = 0, uncitedHumanSupported = 0, fullyHumanAnswers = 0, fullyAutoAnswers = 0;
  let recallSummaryDifferences = 0, precisionSummaryDifferences = 0;
  const humanQuestionRates = [], autoQuestionRates = [], humanEdgeQuestionRates = [], autoEdgeQuestionRates = [];
  const sentenceCountHistogram = {};
  const sentenceDisagreementRecords = [];
  const examples = { emptyOutput: [], aboveThreeOccurrenceCap: [], repeatedNumericCitationIds: [], citationOnly: [],
    humanPositiveAutomaticNegative: [], humanNegativeAutomaticPositive: [], fullEdgeInNotFullySupportedSentence: [] };
  const remember = (name, record, index, details = {}) => {
    if (examples[name].length < 3) examples[name].push({ questionId: record.id, ...(index === null ? {} : { sentenceIndex: index }), ...details });
  };
  for (const record of records) {
    const sentenceCount = record.sentences.length;
    sentenceCountHistogram[sentenceCount] = (sentenceCountHistogram[sentenceCount] ?? 0) + 1;
    counts.sentences += sentenceCount;
    if (sentenceCount) counts.nonemptyOutputs++;
    else { counts.emptyOutputs++; remember('emptyOutput', record, null); }
    const qHuman = [], qAuto = [], qHumanEdges = [], qAutoEdges = [], sentenceTexts = new Set();
    record.sentences.forEach((sentence, index) => {
      const ids = parseCitationMarkers(sentence.text);
      const citationCount = sentence.citations.length;
      const human = sentence.sentence_recall_score, automatic = record.automatic_recall_scores[index];
      qHuman.push(human); qAuto.push(automatic);
      humanSupported += human; autoSupported += automatic;
      sentenceMatrix[human][automatic]++;
      if (human !== automatic) sentenceDisagreementRecords.push({ questionId: record.id, sentenceIndex: index, humanRecallLabel: human, automaticRecallLabel: automatic });
      if (human === 1 && automatic === 0) remember('humanPositiveAutomaticNegative', record, index);
      if (human === 0 && automatic === 1) remember('humanNegativeAutomaticPositive', record, index);
      counts.numericCitationOccurrences += ids.length;
      counts.scoredCitationOccurrences += citationCount;
      counts.unscoredNumericCitationOccurrences += ids.length - citationCount;
      if (ids.length) {
        counts.sentencesWithNumericCitations++;
        if (!human) citedHumanUnsupported++;
      } else {
        counts.sentencesWithoutNumericCitations++;
        uncitedHumanSupported += human;
      }
      if (ids.length > SOURCE.maximumScoredCitationsPerSentence) {
        counts.sentencesAboveThreeOccurrenceCap++;
        remember('aboveThreeOccurrenceCap', record, index, { numericOccurrences: ids.length, scoredOccurrences: citationCount });
      }
      const repeated = ids.length - new Set(ids).size;
      if (repeated) {
        counts.sentencesWithRepeatedNumericCitationIds++;
        counts.repeatedNumericCitationOccurrences += repeated;
        remember('repeatedNumericCitationIds', record, index, { repeatedOccurrences: repeated });
      }
      if (ids.length && !/[\p{L}\p{N}]/u.test(sentence.text.replace(/\[\d+\]/g, ''))) {
        counts.citationOnlySentenceUnits++;
        remember('citationOnly', record, index);
      }
      if (sentenceTexts.has(sentence.text)) counts.repeatedSentenceTextsWithinQuestions++;
      sentenceTexts.add(sentence.text);
      sentence.citations.forEach((citation, edgeIndex) => {
        const h = citation.citation_precision_score;
        const a = record.automatic_citation_precision_scores[index][edgeIndex];
        humanRaw[h]++; automaticRaw[a]++; rawHumanBySentenceLabel[human][h]++;
        // Reproduce analyze.py's edge acceptance transformation, not individual full entailment.
        const acceptedHuman = Number(human === 1 && h > 0);
        const acceptedAuto = Number(automatic === 1 && a > 0);
        humanEdges += acceptedHuman; autoEdges += acceptedAuto;
        qHumanEdges.push(acceptedHuman); qAutoEdges.push(acceptedAuto);
        edgeMatrix[acceptedHuman][acceptedAuto]++;
        if (h === 2 && human === 0) remember('fullEdgeInNotFullySupportedSentence', record, index, { citationArrayIndex: edgeIndex });
      });
    });
    if (!qHumanEdges.length) counts.questionsWithoutScoredCitations++;
    // Empty outputs stay in the question macro as zero; never count vacuous all([]) as success.
    if (qHuman.length && qHuman.every(value => value === 1)) fullyHumanAnswers++;
    if (qAuto.length && qAuto.every(value => value === 1)) fullyAutoAnswers++;
    humanQuestionRates.push(meanOrZero(qHuman)); autoQuestionRates.push(meanOrZero(qAuto));
    humanEdgeQuestionRates.push(meanOrZero(qHumanEdges)); autoEdgeQuestionRates.push(meanOrZero(qAutoEdges));
    if (Math.abs(record.overall_recall_score - meanOrZero(qHuman)) > 1e-12) recallSummaryDifferences++;
    if (Math.abs(record.overall_precision_score - meanOrZero(qHumanEdges)) > 1e-12) precisionSummaryDifferences++;
  }
  return {
    counts, sentenceCountHistogram,
    sentenceSupport: {
      humanMicro: ratio(humanSupported, counts.sentences), automaticMicro: ratio(autoSupported, counts.sentences),
      humanEqualQuestionMacro: macro(humanQuestionRates), automaticEqualQuestionMacro: macro(autoQuestionRates),
      entirelyHumanSupportedAnswers: ratio(fullyHumanAnswers, counts.questions),
      entirelyAutomaticSupportedAnswers: ratio(fullyAutoAnswers, counts.questions),
    },
    structuralCoverage: {
      sentenceNumericCitationPresence: ratio(counts.sentencesWithNumericCitations, counts.sentences),
      citedButHumanNotFullySupported: ratio(citedHumanUnsupported, counts.sentencesWithNumericCitations),
      uncitedButHumanFullySupported: ratio(uncitedHumanSupported, counts.sentencesWithoutNumericCitations),
      warning: 'Numeric markers show citation presence only; semantic support comes exclusively from released labels.',
    },
    scoredCitationLabels: {
      unit: 'archived scored citation occurrence; repeated document IDs are not deduplicated',
      humanRaw: { none: humanRaw[0], partial: humanRaw[1], full: humanRaw[2] },
      automaticRaw: { label0: automaticRaw[0], label1: automaticRaw[1], label2: automaticRaw[2] },
      rawHumanBySentenceLabel: { rows: 'sentence_recall_score 0,1', columns: 'citation_precision_score 0,1,2', matrix: rawHumanBySentenceLabel },
      humanRawFull: ratio(humanRaw[2], counts.scoredCitationOccurrences),
      humanRawPartial: ratio(humanRaw[1], counts.scoredCitationOccurrences),
      humanRawNonzero: ratio(humanRaw[1] + humanRaw[2], counts.scoredCitationOccurrences),
      upstreamAcceptedHumanMicro: ratio(humanEdges, counts.scoredCitationOccurrences),
      upstreamAcceptedAutomaticMicro: ratio(autoEdges, counts.scoredCitationOccurrences),
      upstreamAcceptedHumanEqualQuestionMacro: macro(humanEdgeQuestionRates),
      upstreamAcceptedAutomaticEqualQuestionMacro: macro(autoEdgeQuestionRates),
      acceptanceRule: 'sentence recall label === 1 AND citation label > 0; partial citation support can count; this is not full single-document entailment',
    },
    confusion: { sentenceSupport: confusion(sentenceMatrix, 'annotated sentence'), citationAcceptance: confusion(edgeMatrix, 'scored citation occurrence after recall gating') },
    archiveConsistency: {
      storedHumanRecallDifferentFromRecomputedQuestionRecall: recallSummaryDifferences,
      storedHumanPrecisionDifferentFromRecomputedQuestionEdgeAcceptance: precisionSummaryDifferences,
      warning: 'Stored overall_precision_score and reserved overall_results are not used as this audit\'s metrics; differences do not by themselves establish annotation error.',
    },
    sentenceDisagreementRecords,
    sampleRecordIds: examples,
  };
}

export function auditArchive(bytes) {
  verifySourceBytes(bytes);
  const archive = parseJsonStrict(bytes.toString('utf8'));
  object(archive, 'archive'); object(archive[SOURCE.dataset], `archive.${SOURCE.dataset}`);
  const analysis = auditSelection(archive[SOURCE.dataset][SOURCE.modelKey]);
  requireThat(analysis.counts.questions === SOURCE.expectedQuestions, 'pinned selection question count mismatch');
  return {
    schemaVersion: 1,
    experiment: 'Original aggregation audit of fixed released ALCE outputs and labels, not a new generation or annotation study',
    provenance: {
      ...SOURCE, url: SOURCE_URL,
      modelAlias: 'gpt-35-turbo', exactBackendVersion: null,
      modelVersionDisclosure: 'The archived model key names an Azure deployment alias; an exact dated backend model version is not supplied by this annotation artifact.',
      generatedHere: false, humanAnnotatedHere: false, nliRerunHere: false,
      selectionRule: 'All question records in the fixed ASQA model key; reserved overall_results excluded, empty output retained.',
    },
    ...analysis,
    limitations: [
      'This is one upstream human-evaluation sample, not all ASQA or a current model benchmark.',
      'One released final label per unit is visible; annotator identities, individual votes, and adjudication provenance are not available here.',
      'Sentence segmentation is inherited, including citation-only units and uncited abstentions; this is not newly segmented claim-level factual correctness.',
      'The first-three-citation rule in eval.py explains count-compatible truncation; this artifact does not supply explicit document IDs on annotated citation entries, so no per-document identity alignment is asserted.',
      'Human and automatic labels can disagree internally or with each other; retain labels as released and do not repair them.',
      'Automatic raw 0/1/2 label semantics are not fully specified in the human-evaluation README. Only the nonzero-plus-recall transformation demonstrated by analyze.py is interpreted.',
      'The raw source contains model outputs and retrieved passages; it is fetched into an OS temporary directory, never included in this website deliverable.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  requireThat(args.length === 0 || (args.length === 2 && args[0] === '--input') ||
    (args.length === 4 && args[0] === '--input' && args[2] === '--out'),
    'Usage: node audit.mjs [--input source.json [--out results.json]]');
  const output = `${JSON.stringify(auditArchive(await readFile(args[1] ?? DEFAULT_INPUT)), null, 2)}\n`;
  if (args[3]) await writeFile(args[3], output);
  else process.stdout.write(output);
}

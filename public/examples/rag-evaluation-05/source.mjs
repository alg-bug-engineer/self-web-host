import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SOURCE = Object.freeze({
  repository: 'https://github.com/princeton-nlp/ALCE',
  commit: '246c476a4edfc564266b7346b6e29ef4861ae937',
  path: 'human_eval/human_eval_citations_completed.json',
  sha256: 'cfed9293752413d7c7631f36524dd4ee9ef58b209cdf9c63f6fc1e280b43cca6',
  bytes: 4566797,
  dataset: 'asqa',
  modelKey: 'asqa-gpt-35-turbo-gtr-shot2-ndoc5-42-azure.json',
  expectedQuestions: 100,
  maximumNumericCitationId: 5,
  maximumScoredCitationsPerSentence: 3,
});
export const SOURCE_URL = `${SOURCE.repository.replace('github.com', 'raw.githubusercontent.com')}/${SOURCE.commit}/${SOURCE.path}`;
// Intentionally outside public/ so a website build never publishes the raw corpus.
export const DEFAULT_INPUT = join(tmpdir(), 'rag-evaluation-05', `${SOURCE.sha256}.json`);
export function verifySourceBytes(bytes) {
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== SOURCE.sha256 || bytes.length !== SOURCE.bytes) {
    throw new Error(`Source integrity mismatch: expected ${SOURCE.sha256} (${SOURCE.bytes} bytes), got ${actual} (${bytes.length} bytes)`);
  }
  return actual;
}

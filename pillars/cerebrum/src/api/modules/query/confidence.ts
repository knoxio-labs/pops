/**
 * Confidence badge for a query answer, shared by the one-shot and streaming
 * paths.
 *
 * It is built from what varies between answers: how many of the model's
 * citations resolved to a retrieved source, how those sources were matched, and
 * whether the model said it could not answer. The fused retrieval score is not
 * an input, because RRF bounds it far below any useful cut.
 */
import { INSUFFICIENT_INFORMATION_PHRASE } from './prompts.js';

import type { RetrievalResult } from '../retrieval/types.js';
import type { ConfidenceLevel, SourceCitation } from './types.js';

const HIGH_CONFIDENCE_MIN_CITATIONS = 2;

function admitsInsufficientInformation(answer: string): boolean {
  return answer
    .replaceAll('’', "'")
    .toLowerCase()
    .includes(INSUFFICIENT_INFORMATION_PHRASE.toLowerCase());
}

function isSemanticallyMatched(result: RetrievalResult): boolean {
  return result.matchType === 'semantic' || result.matchType === 'both';
}

/**
 * Grade an answer. `citations` are the citations that resolved to a retrieved
 * source; `retrieved` is the source set they were resolved against.
 *
 * - `low`: no valid citation, or the answer contains the prompt's fixed
 *   insufficient-information phrase.
 * - `high`: at least two valid citations, one of them to a source the semantic
 *   leg matched.
 * - `medium`: everything else.
 */
export function computeConfidence(
  answer: string,
  citations: SourceCitation[],
  retrieved: RetrievalResult[]
): ConfidenceLevel {
  if (citations.length === 0 || admitsInsufficientInformation(answer)) return 'low';

  const citedIds = new Set(citations.map((c) => c.id));
  const citesSemanticMatch = retrieved.some(
    (r) => citedIds.has(r.sourceId) && isSemanticallyMatched(r)
  );

  return citations.length >= HIGH_CONFIDENCE_MIN_CITATIONS && citesSemanticMatch
    ? 'high'
    : 'medium';
}

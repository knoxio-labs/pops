/**
 * Confidence badge for a query answer, shared by the one-shot and streaming
 * paths.
 *
 * It is built from what varies between answers: how many of the model's
 * citations resolved to a retrieved source, how strongly those sources were
 * matched, and whether the model said it could not answer.
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

/**
 * A semantic hit has cleared the cosine floor, so any of them is a strong
 * match. The lexical leg has no floor: one shared word admits an engram. A
 * lexical-only hit therefore counts as strong only when its BM25 is at least
 * this share of the query's best lexical hit.
 */
const STRONG_LEXICAL_MIN_SCORE = 0.5;

function isStronglyMatched(result: RetrievalResult): boolean {
  if (result.matchType === 'semantic' || result.matchType === 'both') return true;
  return result.matchType === 'lexical' && result.score >= STRONG_LEXICAL_MIN_SCORE;
}

/**
 * Grade an answer. `citations` are the citations that resolved to a retrieved
 * source; `retrieved` is the source set they were resolved against.
 *
 * - `low`: no valid citation, or the answer contains the prompt's fixed
 *   insufficient-information phrase.
 * - `high`: at least two valid citations, one of them to a strongly matched
 *   source: one the semantic leg found, or a lexical-only hit scoring at least
 *   0.5. A deployment with no embeddings reaches `high` through the second.
 * - `medium`: everything else.
 */
export function computeConfidence(
  answer: string,
  citations: SourceCitation[],
  retrieved: RetrievalResult[]
): ConfidenceLevel {
  if (citations.length === 0 || admitsInsufficientInformation(answer)) return 'low';

  const citedIds = new Set(citations.map((c) => c.id));
  const citesStrongMatch = retrieved.some((r) => citedIds.has(r.sourceId) && isStronglyMatched(r));

  return citations.length >= HIGH_CONFIDENCE_MIN_CITATIONS && citesStrongMatch ? 'high' : 'medium';
}

/**
 * Reciprocal rank fusion of the semantic and lexical legs.
 *
 * RRF decides ORDER only. A fused hit keeps the `score` its leg gave it — the
 * cosine when the semantic leg found it, the relative BM25 when only the
 * lexical leg did — because callers print `score` as a similarity and the RRF
 * value (at most 2/61) is not one.
 */
import type { RetrievalResult } from './types.js';

const RRF_K = 60;

interface Fused {
  result: RetrievalResult;
  rrf: number;
}

function sourceKey(result: RetrievalResult): string {
  return `${result.sourceType}:${result.sourceId}`;
}

/**
 * Merge two ranked lists, best first. A source both legs found is marked
 * `both`, carries the semantic hit's cosine `score`, and sums both
 * reciprocal ranks. Equal fused ranks keep the semantic hit first: it cleared
 * an absolute cosine floor, and a lexical hit has none.
 */
export function fuseByReciprocalRank(
  semantic: RetrievalResult[],
  lexical: RetrievalResult[],
  limit: number
): RetrievalResult[] {
  const fused = new Map<string, Fused>();

  semantic.forEach((result, index) => {
    fused.set(sourceKey(result), { result, rrf: 1 / (RRF_K + index + 1) });
  });

  lexical.forEach((result, index) => {
    const rrf = 1 / (RRF_K + index + 1);
    const key = sourceKey(result);
    const seen = fused.get(key);
    if (seen) {
      fused.set(key, { result: { ...seen.result, matchType: 'both' }, rrf: seen.rrf + rrf });
    } else {
      fused.set(key, { result, rrf });
    }
  });

  return [...fused.values()]
    .toSorted((a, b) => b.rrf - a.rrf)
    .slice(0, limit)
    .map((entry) => entry.result);
}

/**
 * How a candidate row becomes a ranked search hit, shared by every finance
 * search adapter.
 *
 * Kept apart from the adapters so the three cannot drift into scoring the
 * same text differently: the response is one flat list, and a 0.5 hit from
 * one adapter sitting above a 1.0 hit from another is not a ranking, it is
 * three rankings concatenated.
 *
 * The scale mirrors `pillars/purchases/src/db/services/search-ranking.ts` so
 * the two pillars agree on what counts as an exact match.
 */

export type MatchType = 'exact' | 'prefix' | 'contains';

export interface SearchHit {
  readonly uri: string;
  readonly score: number;
  readonly matchField: string;
  readonly matchType: MatchType;
  readonly data: Record<string, unknown>;
}

/**
 * A scored hit plus the field that breaks its ties against another hit of
 * the same score — a transaction's `date`, a budget's or wishlist item's
 * `lastEditedTime`. Purchases calls the equivalent field `orderedAt`; this
 * is finance's analogue of "recency".
 */
export interface ScoredCandidate {
  readonly hit: SearchHit;
  readonly tieBreak: string;
}

export function classify(
  value: string,
  queryText: string
): { score: number; matchType: MatchType } | null {
  const lower = value.toLowerCase();
  const q = queryText.toLowerCase();

  if (lower === q) return { score: 1.0, matchType: 'exact' };
  if (lower.startsWith(q)) return { score: 0.8, matchType: 'prefix' };
  if (lower.includes(q)) return { score: 0.5, matchType: 'contains' };
  return null;
}

export function byScoreDescending(a: SearchHit, b: SearchHit): number {
  return b.score - a.score;
}

function compareAscending(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Score, then tie-break field (most recent first), then uri — a total
 * order, because two rows never share a uri. Without that last term a tie
 * would be settled by scan order again, one step further down.
 */
function byRank(a: ScoredCandidate, b: ScoredCandidate): number {
  const byScore = byScoreDescending(a.hit, b.hit);
  if (byScore !== 0) return byScore;

  const byRecency = compareAscending(b.tieBreak, a.tieBreak);
  if (byRecency !== 0) return byRecency;

  return compareAscending(a.hit.uri, b.hit.uri);
}

/**
 * Every candidate in total order: score descending, then recency, then uri.
 * Nothing is dropped here — an adapter that needs a response-size bound
 * applies it to this already-ranked list, never to the rows before this
 * runs.
 */
export function rank(candidates: readonly ScoredCandidate[]): SearchHit[] {
  return candidates.toSorted(byRank).map((candidate) => candidate.hit);
}

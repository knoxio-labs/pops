/**
 * How a candidate row becomes a ranked hit, shared by both search adapters.
 *
 * Kept apart from the adapters so the two cannot drift into scoring the same
 * text differently: the response is one flat list and a 0.5 order hit sitting
 * above a 1.0 line hit is not a ranking, it is two rankings concatenated.
 *
 * The scale mirrors `pillars/finance/src/api/rest/search-handlers.ts` so two
 * pillars do not disagree about what counts as an exact match.
 */
import { byNewestFirst, orderRank } from './order-rank.js';

export type SearchMatchType = 'exact' | 'prefix' | 'contains';

export interface PurchaseSearchHit {
  readonly uri: string;
  readonly score: number;
  readonly matchField: string;
  readonly matchType: SearchMatchType;
  readonly data: Record<string, unknown>;
}

/** Hits returned per adapter, applied to the ranked list and nowhere else. */
const HITS_PER_ADAPTER = 25;

/**
 * A scored hit and the order date that breaks its ties.
 *
 * Scores come from a three-value scale, so far more hits tie than not and
 * the cap usually falls inside a tied run. Ordering that run by date rather
 * than leaving it to the scan makes the response a function of the data —
 * the same query over the same rows answers the same, and among matches that
 * are equally good the recent order is the one being asked about.
 */
export interface ScoredCandidate {
  readonly hit: PurchaseSearchHit;
  readonly orderedAt: string;
}

function classify(
  value: string,
  queryText: string
): { score: number; matchType: SearchMatchType } | null {
  const lower = value.toLowerCase();
  const q = queryText.toLowerCase();

  if (lower === q) return { score: 1.0, matchType: 'exact' };
  if (lower.startsWith(q)) return { score: 0.8, matchType: 'prefix' };
  if (lower.includes(q)) return { score: 0.5, matchType: 'contains' };
  return null;
}

/**
 * The best-scoring field of a row, so a row that matches on two fields is
 * one hit at its strongest match rather than two hits competing with each
 * other for the same section.
 */
export function bestMatch(
  candidates: readonly { readonly field: string; readonly value: string | null }[],
  text: string
): { field: string; score: number; matchType: SearchMatchType } | null {
  let best: { field: string; score: number; matchType: SearchMatchType } | null = null;
  for (const candidate of candidates) {
    if (candidate.value === null) continue;
    const match = classify(candidate.value, text);
    if (match === null) continue;
    if (best === null || match.score > best.score) {
      best = { field: candidate.field, score: match.score, matchType: match.matchType };
    }
  }
  return best;
}

export function byScoreDescending(a: PurchaseSearchHit, b: PurchaseSearchHit): number {
  return b.score - a.score;
}

/**
 * Score, then recency, then uri — a total order, because two rows never
 * share a uri. Without that last term a tie at the cap would be settled by
 * the scan again, one step further down.
 *
 * Recency is the instant the timestamp names rather than the text of it.
 * The column holds one spelling, so for every row the writer wrote the two
 * orderings are the same; a row migration `0010` could not read is why this
 * asks {@link orderRank} anyway, since a value like `whenever` outranks
 * every real date as text and would sit at the head of every hit list.
 */
function byRank(a: ScoredCandidate, b: ScoredCandidate): number {
  const byScore = byScoreDescending(a.hit, b.hit);
  if (byScore !== 0) return byScore;

  return byNewestFirst(orderRank(a.orderedAt, a.hit.uri), orderRank(b.orderedAt, b.hit.uri));
}

export function rank(candidates: readonly ScoredCandidate[]): PurchaseSearchHit[] {
  return candidates
    .toSorted(byRank)
    .slice(0, HITS_PER_ADAPTER)
    .map((candidate) => candidate.hit);
}

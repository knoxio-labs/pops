import { searchLinePageCandidates } from './search-page-lines.js';
import { searchOrderPageCandidates } from './search-page-orders.js';
import {
  decodeSearchPageCursor,
  encodeSearchPageCursor,
  searchPageQueryKey,
} from './search-page-query.js';
import { byScoreDescending } from './search-ranking.js';
import { normalizeSearchText } from './search-text.js';

import type { PurchasesDb } from './internal.js';
import type { PurchaseSearchScope } from './search-filters.js';
import type { SearchPageCandidate } from './search-page-query.js';
import type { PurchaseSearchHit } from './search-ranking.js';

export interface SearchPageOptions {
  readonly kind?: 'purchases' | 'lines';
  readonly cursor?: string;
  readonly limit: number;
}

export interface SearchPage {
  readonly hits: readonly PurchaseSearchHit[];
  readonly nextCursor: string | null;
  readonly totalCount: number;
  readonly candidateRowsRead: number;
}

function byGlobalRank(a: SearchPageCandidate, b: SearchPageCandidate): number {
  return byScoreDescending(a.candidate.hit, b.candidate.hit);
}

/**
 * Return one bounded page of the complete deterministic search ranking.
 * Each adapter applies its text, scope, cursor, and result limit in SQLite;
 * only the first `limit + 1` candidates from each adapter are materialized.
 *
 * `null` means the continuation token is malformed or belongs to another
 * search/filter/kind.
 */
export function searchPurchasesPage(
  db: PurchasesDb,
  text: string,
  scope: PurchaseSearchScope,
  options: SearchPageOptions
): SearchPage | null {
  const normalizedText = normalizeSearchText(text);
  const key = searchPageQueryKey(normalizedText, scope, options.kind);
  const cursor = options.cursor === undefined ? null : decodeSearchPageCursor(options.cursor, key);
  if (options.cursor !== undefined && cursor === null) return null;
  if (normalizedText.length === 0) {
    return { hits: [], nextCursor: null, totalCount: 0, candidateRowsRead: 0 };
  }

  const emptyAdapter = { candidates: [], rowsRead: 0, totalCount: 0 } as const;
  const purchases =
    options.kind === 'lines'
      ? emptyAdapter
      : searchOrderPageCandidates(db, {
          text: normalizedText,
          scope,
          cursor,
          limit: options.limit,
        });
  const lines =
    options.kind === 'purchases'
      ? emptyAdapter
      : searchLinePageCandidates(db, {
          text: normalizedText,
          scope,
          cursor,
          limit: options.limit,
        });
  const candidates = [...purchases.candidates, ...lines.candidates].toSorted(byGlobalRank);
  const hits = candidates.slice(0, options.limit);
  const hasMore = candidates.length > options.limit;
  const last = hits.at(-1);

  return {
    hits: hits.map(({ candidate }) => candidate.hit),
    nextCursor: hasMore && last !== undefined ? encodeSearchPageCursor(key, last) : null,
    totalCount: purchases.totalCount + lines.totalCount,
    candidateRowsRead: purchases.rowsRead + lines.rowsRead,
  };
}

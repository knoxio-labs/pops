import { itemCandidate, itemRows } from './search-item-adapter.js';
/**
 * Free-text search over orders and line items.
 *
 * Two adapters, one flat ranked list, because that is what a pillar's
 * `/search` returns: the orchestrator decorates at pillar granularity and
 * cannot split a pillar's hits back into per-adapter sections
 * (`pillars/orchestrator/src/search/federation.ts`). Each adapter's own row
 * scan and candidate scoring lives beside it, in `search-order-adapter.ts`
 * and `search-item-adapter.ts` — this file only ranks the union.
 *
 * **Line items are the point.** An order matches on the merchant's name,
 * which finance can already answer from a transaction description. Only this
 * pillar can answer "which order had the dosing funnel in it", so the item
 * adapter searches `name`, `sku` and `tag`, and every item hit carries its
 * `purchaseId` — a line is meaningless without the order it was bought on.
 *
 * **Matching is a candidate scan, then a rank.** `LIKE '%text%'` narrows in
 * SQL and `search-ranking.ts` scores what comes back. No FTS index: the
 * corpus is a four-figure row count and an index would be a second thing to
 * keep in step with the writes.
 *
 * **The cap is per adapter and lands after the ranking**, so the hits it
 * drops are the ones that matched worst. Per adapter rather than over the
 * whole response, because one cap over the union lets a hundred order hits
 * starve every line hit out of an answer only the lines can give.
 *
 * **A scope narrows in SQL, before anything is scored.** Both adapters take
 * the same one and take it through `purchaseFilterConditions`, so a filtered
 * search covers exactly the orders the index covers for the same filter, and
 * an item is in scope exactly when its order is. `tags` is the one term of
 * that scope neither adapter reads from `purchaseFilterConditions`, because
 * it narrows on a line's own column — see `search-tags.ts`.
 *
 * **The ranking is over the union.** Concatenating two already-sorted lists
 * is not a sorted list — a 0.5 order hit would sit above a 1.0 item hit —
 * and the orchestrator re-sorting a section does not save the MCP tool,
 * which reads this response directly.
 */
import { orderCandidate, orderRows } from './search-order-adapter.js';
import { byScoreDescending, rank } from './search-ranking.js';
import { matchingTagByItem } from './search-tags.js';

import type { PurchasesDb } from './internal.js';
import type { PurchaseSearchScope } from './search-filters.js';
import type { PurchaseSearchHit, ScoredCandidate } from './search-ranking.js';

export type { PurchaseSearchHit, SearchMatchType } from './search-ranking.js';

function scored<TRow>(
  rows: readonly TRow[],
  toCandidate: (row: TRow, text: string) => ScoredCandidate | null,
  text: string
): PurchaseSearchHit[] {
  const candidates: ScoredCandidate[] = [];
  for (const row of rows) {
    const candidate = toCandidate(row, text);
    if (candidate !== null) candidates.push(candidate);
  }
  return rank(candidates);
}

/**
 * Both adapters' hits as one ranked list. A blank query returns nothing
 * rather than everything: an empty search box must not page the whole pillar.
 *
 * `toSorted` is stable, so an order hit and a line hit that tie keep the
 * adapter order above — orders first, matching the declaration order in the
 * manifest. Each adapter has already put its own hits in a total order, so
 * that leaves the whole response decided by the rows rather than by the
 * scan that read them.
 *
 * The item adapter searches `name`, `sku` and `tag`: `matchingTagByItem` is
 * computed once up front and threaded through both the row scan (widening it
 * to items that only match on a tag) and the candidate scorer (so a tag
 * hit's `matchField` reads `'tag'`).
 */
export function searchPurchases(
  db: PurchasesDb,
  text: string,
  scope: PurchaseSearchScope = {}
): PurchaseSearchHit[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const taggedItemIds = matchingTagByItem(db, trimmed);

  return [
    ...scored(orderRows(db, trimmed, scope), orderCandidate, trimmed),
    ...scored(
      itemRows(db, trimmed, scope, taggedItemIds),
      (row, text) => itemCandidate(row, text, taggedItemIds),
      trimmed
    ),
  ].toSorted(byScoreDescending);
}

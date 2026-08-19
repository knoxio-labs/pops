/**
 * Free-text search over orders and line items.
 *
 * Two adapters, one flat ranked list, because that is what a pillar's
 * `/search` returns: the orchestrator decorates at pillar granularity and
 * cannot split a pillar's hits back into per-adapter sections
 * (`pillars/orchestrator/src/search/federation.ts`).
 *
 * **Line items are the point.** An order matches on the merchant's name,
 * which finance can already answer from a transaction description. Only this
 * pillar can answer "which order had the dosing funnel in it", so the item
 * adapter searches `name` and `sku` and every item hit carries its
 * `purchaseId` — a line is meaningless without the order it was bought on.
 * The `sku` predicate is over the raw column, because a caller typing an
 * ASIN types the identifier and not the namespace it lives in; the hit
 * carries both, because that is what a consumer may group on.
 *
 * **Matching is a candidate scan, then a rank.** `LIKE '%text%'` narrows in
 * SQL and `search-ranking.ts` scores what comes back. No FTS index: the
 * corpus is a four-figure row count and an index would be a second thing to
 * keep in step with the writes.
 *
 * **Nothing is dropped before it is scored.** A `LIKE '%text%'` predicate
 * cannot use an index, so the scan reads the whole table whatever happens
 * next and returns rows in no order worth the name. A cap applied to that
 * would decide the answer by which rows were written first: the exact match
 * a query is looking for sits behind a hundred weaker ones and is never
 * scored at all, and the response changes as the table grows. Scoring the
 * scan costs one pass over the rows the predicate already visited.
 *
 * **The cap is per adapter and lands after the ranking**, so the hits it
 * drops are the ones that matched worst. Per adapter rather than over the
 * whole response, because one cap over the union lets a hundred order hits
 * starve every line hit out of an answer only the lines can give.
 *
 * **A scope narrows in SQL, before anything is scored.** Both adapters take
 * the same one and take it through `purchaseFilterConditions`, so a filtered
 * search covers exactly the orders the index covers for the same filter, and
 * an item is in scope exactly when its order is. Applying it after the rank
 * instead would let excluded orders spend the cap: the twenty-sixth-best
 * match in the requested source would be dropped for twenty-five better
 * matches the caller asked not to see.
 *
 * **The ranking is over the union.** Concatenating two already-sorted lists
 * is not a sorted list — a 0.5 order hit would sit above a 1.0 item hit —
 * and the orchestrator re-sorting a section does not save the MCP tool,
 * which reads this response directly.
 *
 * A truncated ranked list is what a search result *is*, unlike the merchant
 * roll-up where a truncated answer is a wrong one: the score ordering means
 * the dropped tail is the part that matched worst.
 */
import { and, eq, like, or, sql } from 'drizzle-orm';

import { purchaseItems, purchases } from '../schema.js';
import { purchaseFilterConditions } from './purchase-reads.js';
import { bestMatch, byScoreDescending, rank } from './search-ranking.js';
import { productIdentityOf } from './stored-product-identity.js';

import type { SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import type { PurchaseItemRow, PurchaseRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';
import type { PurchaseScopeFilter } from './purchase-reads.js';
import type { PurchaseSearchHit, ScoredCandidate } from './search-ranking.js';

/**
 * The columns each adapter scans, projected from the row types so a schema
 * change reaches the hit payload rather than being re-declared beside it.
 */
type OrderRow = Pick<
  PurchaseRow,
  | 'id'
  | 'source'
  | 'sourceOrderId'
  | 'merchantEntityId'
  | 'merchantEntityName'
  | 'orderedAt'
  | 'currency'
  | 'totalCents'
  | 'status'
>;

type ItemRow = Pick<
  PurchaseItemRow,
  | 'id'
  | 'purchaseId'
  | 'name'
  | 'sku'
  | 'skuScheme'
  | 'quantity'
  | 'lineTotalCents'
  | 'refundedCents'
> &
  Pick<PurchaseRow, 'orderedAt' | 'currency' | 'merchantEntityName'>;

export type { PurchaseSearchHit, SearchMatchType } from './search-ranking.js';

function containsInsensitive(column: AnySQLiteColumn, text: string): SQL {
  return like(sql`lower(${column})`, `%${text.toLowerCase()}%`);
}

function orderRows(db: PurchasesDb, text: string, scope: PurchaseScopeFilter): OrderRow[] {
  return db
    .select({
      id: purchases.id,
      source: purchases.source,
      sourceOrderId: purchases.sourceOrderId,
      merchantEntityId: purchases.merchantEntityId,
      merchantEntityName: purchases.merchantEntityName,
      orderedAt: purchases.orderedAt,
      currency: purchases.currency,
      totalCents: purchases.totalCents,
      status: purchases.status,
    })
    .from(purchases)
    .where(
      and(
        or(
          containsInsensitive(purchases.merchantEntityName, text),
          containsInsensitive(purchases.sourceOrderId, text),
          containsInsensitive(purchases.source, text)
        ),
        ...purchaseFilterConditions(scope)
      )
    )
    .all();
}

function orderCandidate(row: OrderRow, text: string): ScoredCandidate | null {
  const match = bestMatch(
    [
      { field: 'merchantEntityName', value: row.merchantEntityName },
      { field: 'sourceOrderId', value: row.sourceOrderId },
      { field: 'source', value: row.source },
    ],
    text
  );
  if (match === null) return null;

  return {
    orderedAt: row.orderedAt,
    hit: {
      uri: `pops:purchases/purchase/${row.id}`,
      score: match.score,
      matchField: match.field,
      matchType: match.matchType,
      data: {
        source: row.source,
        sourceOrderId: row.sourceOrderId,
        // Both, never one: the id is the operative identity and the name is
        // only its label, and every export-ingested order carries the label
        // alone. A consumer that sees only a name must not read it as an id.
        merchantEntityId: row.merchantEntityId,
        merchantEntityName: row.merchantEntityName,
        orderedAt: row.orderedAt,
        currency: row.currency,
        totalCents: row.totalCents,
        status: row.status,
      },
    },
  };
}

function itemRows(db: PurchasesDb, text: string, scope: PurchaseScopeFilter): ItemRow[] {
  return db
    .select({
      id: purchaseItems.id,
      purchaseId: purchaseItems.purchaseId,
      name: purchaseItems.name,
      sku: purchaseItems.sku,
      skuScheme: purchaseItems.skuScheme,
      quantity: purchaseItems.quantity,
      lineTotalCents: purchaseItems.lineTotalCents,
      refundedCents: purchaseItems.refundedCents,
      orderedAt: purchases.orderedAt,
      currency: purchases.currency,
      merchantEntityName: purchases.merchantEntityName,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
    .where(
      and(
        or(
          containsInsensitive(purchaseItems.name, text),
          containsInsensitive(purchaseItems.sku, text)
        ),
        ...purchaseFilterConditions(scope)
      )
    )
    .all();
}

function itemCandidate(row: ItemRow, text: string): ScoredCandidate | null {
  const match = bestMatch(
    [
      { field: 'name', value: row.name },
      { field: 'sku', value: row.sku },
    ],
    text
  );
  if (match === null) return null;

  return {
    orderedAt: row.orderedAt,
    hit: {
      uri: `pops:purchases/purchase-item/${row.id}`,
      score: match.score,
      matchField: match.field,
      matchType: match.matchType,
      data: {
        // A line cannot be addressed without its order — the pillar's only
        // item route is scoped under one, and a hit that omitted this would
        // be unreachable.
        purchaseId: row.purchaseId,
        name: row.name,
        // The namespace travels with the identifier here too: a hit is what
        // an MCP tool reads, and a bare string is what it would join on.
        sku: productIdentityOf(row),
        quantity: row.quantity,
        lineTotalCents: row.lineTotalCents,
        refundedCents: row.refundedCents,
        orderedAt: row.orderedAt,
        currency: row.currency,
        merchantEntityName: row.merchantEntityName,
      },
    },
  };
}

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
 */
export function searchPurchases(
  db: PurchasesDb,
  text: string,
  scope: PurchaseScopeFilter = {}
): PurchaseSearchHit[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  return [
    ...scored(orderRows(db, trimmed, scope), orderCandidate, trimmed),
    ...scored(itemRows(db, trimmed, scope), itemCandidate, trimmed),
  ].toSorted(byScoreDescending);
}

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
 *
 * **Matching is a candidate scan, then a rank.** `LIKE '%text%'` narrows in
 * SQL and {@link classify} scores what comes back, mirroring
 * `pillars/finance/src/api/rest/search-handlers.ts` so two pillars do not
 * disagree about what counts as an exact match. No FTS index: the corpus is
 * a four-figure row count and an index would be a second thing to keep in
 * step with the writes.
 *
 * **The cap is per adapter, the ranking is over the union.** Capping per
 * adapter first is what stops 100 order hits starving every line hit out of
 * the response; sorting afterwards is what makes the single returned list
 * actually ranked. Concatenating two already-sorted lists is not a sorted
 * list — a 0.5 order hit would sit above a 1.0 item hit — and the orchestrator
 * re-sorting a section does not save the MCP tool, which reads this response
 * directly.
 *
 * A truncated ranked list is what a search result *is*, unlike the merchant
 * roll-up where a truncated answer is a wrong one: the score ordering means
 * the dropped tail is the part that matched worst.
 */
import { eq, like, or, sql } from 'drizzle-orm';

import { purchaseItems, purchases } from '../schema.js';

import type { SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import type { PurchasesDb } from './internal.js';

export type SearchMatchType = 'exact' | 'prefix' | 'contains';

export interface PurchaseSearchHit {
  readonly uri: string;
  readonly score: number;
  readonly matchField: string;
  readonly matchType: SearchMatchType;
  readonly data: Record<string, unknown>;
}

/**
 * Candidate rows read per adapter before ranking. Comfortably above the five
 * the shell renders, so the top of the ranked list is stable rather than
 * being whatever SQLite returned first.
 */
const CANDIDATE_LIMIT = 100;

/** Hits returned per adapter after ranking. */
const HITS_PER_ADAPTER = 25;

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
function bestMatch(
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

function containsInsensitive(column: AnySQLiteColumn, text: string): SQL {
  return like(sql`lower(${column})`, `%${text.toLowerCase()}%`);
}

function searchOrders(db: PurchasesDb, text: string): PurchaseSearchHit[] {
  const rows = db
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
      or(
        containsInsensitive(purchases.merchantEntityName, text),
        containsInsensitive(purchases.sourceOrderId, text),
        containsInsensitive(purchases.source, text)
      )
    )
    .limit(CANDIDATE_LIMIT)
    .all();

  const hits: PurchaseSearchHit[] = [];
  for (const row of rows) {
    const match = bestMatch(
      [
        { field: 'merchantEntityName', value: row.merchantEntityName },
        { field: 'sourceOrderId', value: row.sourceOrderId },
        { field: 'source', value: row.source },
      ],
      text
    );
    if (match === null) continue;

    hits.push({
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
    });
  }

  return rank(hits);
}

function searchItems(db: PurchasesDb, text: string): PurchaseSearchHit[] {
  const rows = db
    .select({
      id: purchaseItems.id,
      purchaseId: purchaseItems.purchaseId,
      name: purchaseItems.name,
      sku: purchaseItems.sku,
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
      or(
        containsInsensitive(purchaseItems.name, text),
        containsInsensitive(purchaseItems.sku, text)
      )
    )
    .limit(CANDIDATE_LIMIT)
    .all();

  const hits: PurchaseSearchHit[] = [];
  for (const row of rows) {
    const match = bestMatch(
      [
        { field: 'name', value: row.name },
        { field: 'sku', value: row.sku },
      ],
      text
    );
    if (match === null) continue;

    hits.push({
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
        sku: row.sku,
        quantity: row.quantity,
        lineTotalCents: row.lineTotalCents,
        refundedCents: row.refundedCents,
        orderedAt: row.orderedAt,
        currency: row.currency,
        merchantEntityName: row.merchantEntityName,
      },
    });
  }

  return rank(hits);
}

function byScoreDescending(a: PurchaseSearchHit, b: PurchaseSearchHit): number {
  return b.score - a.score;
}

function rank(hits: readonly PurchaseSearchHit[]): PurchaseSearchHit[] {
  return hits.toSorted(byScoreDescending).slice(0, HITS_PER_ADAPTER);
}

/**
 * Both adapters' hits as one ranked list. A blank query returns nothing
 * rather than everything: an empty search box must not page the whole pillar.
 *
 * `toSorted` is stable, so an order hit and a line hit that tie keep the
 * adapter order above — orders first, matching the declaration order in the
 * manifest.
 */
export function searchPurchases(db: PurchasesDb, text: string): PurchaseSearchHit[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return [...searchOrders(db, trimmed), ...searchItems(db, trimmed)].toSorted(byScoreDescending);
}

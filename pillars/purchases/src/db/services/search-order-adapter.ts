/**
 * The order half of `search.ts`'s two adapters: which orders a query and a
 * scope admit, and the hit one becomes.
 */
import { and, inArray, or } from 'drizzle-orm';

import { purchases } from '../schema.js';
import { purchaseFilterConditions } from './purchase-reads.js';
import { bestMatch } from './search-ranking.js';
import { purchaseIdsWithTaggedItems } from './search-tags.js';
import { containsInsensitive } from './search-text.js';

import type { PurchaseRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';
import type { PurchaseSearchScope } from './search-filters.js';
import type { ScoredCandidate } from './search-ranking.js';

/**
 * The columns the order adapter scans, projected from the row type so a
 * schema change reaches the hit payload rather than being re-declared
 * beside it.
 */
export type OrderRow = Pick<
  PurchaseRow,
  | 'id'
  | 'source'
  | 'sourceOrderId'
  | 'merchantEntityId'
  | 'merchantEntityName'
  | 'orderedAt'
  | 'orderedAtOffsetMinutes'
  | 'currency'
  | 'totalCents'
  | 'status'
>;

export function orderRows(db: PurchasesDb, text: string, scope: PurchaseSearchScope): OrderRow[] {
  const tags = scope.tags ?? [];
  const tagCondition =
    tags.length > 0 ? [inArray(purchases.id, [...purchaseIdsWithTaggedItems(db, tags)])] : [];

  return db
    .select({
      id: purchases.id,
      source: purchases.source,
      sourceOrderId: purchases.sourceOrderId,
      merchantEntityId: purchases.merchantEntityId,
      merchantEntityName: purchases.merchantEntityName,
      orderedAt: purchases.orderedAt,
      orderedAtOffsetMinutes: purchases.orderedAtOffsetMinutes,
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
        ...purchaseFilterConditions(scope),
        ...tagCondition
      )
    )
    .all();
}

export function orderCandidate(row: OrderRow, text: string): ScoredCandidate | null {
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
        orderedAtOffsetMinutes: row.orderedAtOffsetMinutes,
        currency: row.currency,
        totalCents: row.totalCents,
        status: row.status,
      },
    },
  };
}

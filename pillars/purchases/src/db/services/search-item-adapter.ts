/**
 * The line-item half of `search.ts`'s two adapters: which lines a query, a
 * scope and a tag match admit, and the hit one becomes.
 */
import { and, eq, inArray, or } from 'drizzle-orm';

import { purchaseItems, purchases } from '../schema.js';
import { purchaseFilterConditions } from './purchase-reads.js';
import { bestMatch } from './search-ranking.js';
import { itemIdsWithTags } from './search-tags.js';
import { containsInsensitive } from './search-text.js';
import { productIdentityOf } from './stored-product-identity.js';

import type { PurchaseItemRow, PurchaseRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';
import type { PurchaseSearchScope } from './search-filters.js';
import type { ScoredCandidate } from './search-ranking.js';

/**
 * The columns the item adapter scans, projected from the row types so a
 * schema change reaches the hit payload rather than being re-declared
 * beside it.
 */
export type ItemRow = Pick<
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
  Pick<
    PurchaseRow,
    | 'orderedAt'
    | 'orderedAtOffsetMinutes'
    | 'currency'
    | 'merchantEntityName'
    | 'status'
    | 'totalCents'
  >;

export function itemRows(
  db: PurchasesDb,
  text: string,
  scope: PurchaseSearchScope,
  taggedItemIds: Map<string, string>
): ItemRow[] {
  const filterTags = scope.tags ?? [];
  const filterCondition =
    filterTags.length > 0 ? [inArray(purchaseItems.id, [...itemIdsWithTags(db, filterTags)])] : [];

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
      orderedAtOffsetMinutes: purchases.orderedAtOffsetMinutes,
      currency: purchases.currency,
      merchantEntityName: purchases.merchantEntityName,
      status: purchases.status,
      totalCents: purchases.totalCents,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchaseItems.purchaseId, purchases.id))
    .where(
      and(
        or(
          containsInsensitive(purchaseItems.name, text),
          containsInsensitive(purchaseItems.sku, text),
          ...(taggedItemIds.size > 0 ? [inArray(purchaseItems.id, [...taggedItemIds.keys()])] : [])
        ),
        ...purchaseFilterConditions(scope),
        ...filterCondition
      )
    )
    .all();
}

export function itemCandidate(
  row: ItemRow,
  text: string,
  taggedItemIds: Map<string, string>
): ScoredCandidate | null {
  const match = bestMatch(
    [
      { field: 'name', value: row.name },
      { field: 'sku', value: row.sku },
      { field: 'tag', value: taggedItemIds.get(row.id) ?? null },
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
        totalCents: row.totalCents,
        refundedCents: row.refundedCents,
        orderedAt: row.orderedAt,
        orderedAtOffsetMinutes: row.orderedAtOffsetMinutes,
        currency: row.currency,
        merchantEntityName: row.merchantEntityName,
        // The order's own reconciliation status, carried onto the line: a
        // line hit is opened alongside its order and a consumer narrowing
        // search results by status needs it on every hit, not only the
        // order-adapter's own.
        status: row.status,
        // The tag that matched the query text, independent of whether it was
        // this row's BEST match — a consumer highlighting what matched needs
        // the literal substring, and `matchField` alone only names which
        // field won, never what was found there.
        matchedTag: taggedItemIds.get(row.id) ?? null,
      },
    },
  };
}

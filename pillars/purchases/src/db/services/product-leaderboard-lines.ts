/**
 * The rows the product-grain leaderboard folds: one per line, carrying the
 * order facts the fold needs about it.
 *
 * Separated from the fold because "which rows are in scope" and "what those
 * rows add up to" fail differently and are read at different times. The
 * scope is where a leaderboard silently covers different orders than the
 * index it sits beside; the fold is where the arithmetic goes wrong.
 */
import { and, eq } from 'drizzle-orm';

import { purchaseItems, purchases } from '../schema.js';
import { purchaseFilterConditions, type PurchaseScopeFilter } from './purchase-reads.js';

import type { PurchaseItemRow, PurchaseRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

/**
 * One line, with the order facts the fold needs about it.
 *
 * Projected off the row types rather than restated, so a column that changes
 * shape in the schema changes shape here rather than being quietly widened
 * by an inferred type.
 */
export interface ScopedLine
  extends
    Pick<
      PurchaseItemRow,
      | 'purchaseId'
      | 'name'
      | 'sku'
      | 'quantity'
      | 'lineTotalCents'
      | 'allocatedShippingCents'
      | 'allocatedAdjustmentCents'
      | 'refundedCents'
    >,
    Pick<
      PurchaseRow,
      'source' | 'orderedAt' | 'currency' | 'merchantEntityId' | 'merchantEntityName'
    > {
  readonly itemId: string;
}

/**
 * The lines a scope selects.
 *
 * One query and one row per line: `purchase_items` joined to its order, with
 * the same predicates the order index applies for the same filter, so the
 * leaderboard covers exactly the orders that filter selects. Nothing joins
 * charges or links — that is what keeps a count of distinct orders from
 * multiplying by however many charges settled them.
 */
export function selectScopedLines(
  db: PurchasesDb,
  filter: PurchaseScopeFilter
): readonly ScopedLine[] {
  const scope = purchaseFilterConditions(filter);
  const query = db
    .select({
      itemId: purchaseItems.id,
      purchaseId: purchaseItems.purchaseId,
      name: purchaseItems.name,
      sku: purchaseItems.sku,
      quantity: purchaseItems.quantity,
      lineTotalCents: purchaseItems.lineTotalCents,
      allocatedShippingCents: purchaseItems.allocatedShippingCents,
      allocatedAdjustmentCents: purchaseItems.allocatedAdjustmentCents,
      refundedCents: purchaseItems.refundedCents,
      source: purchases.source,
      orderedAt: purchases.orderedAt,
      currency: purchases.currency,
      merchantEntityId: purchases.merchantEntityId,
      merchantEntityName: purchases.merchantEntityName,
    })
    .from(purchaseItems)
    .innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId));

  return (scope.length > 0 ? query.where(and(...scope)) : query).all();
}

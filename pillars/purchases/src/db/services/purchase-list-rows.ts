/**
 * The list read: an order plus the two things a row draws that are not columns.
 *
 * Its own module rather than another function in `purchase-reads.ts` because
 * the concern is different. That file assembles a whole order for a reader who
 * opened one; this one answers a page for a reader who is scrolling, and the
 * shape of the work is the opposite — two grouped queries over the ids on the
 * page rather than six over a single id.
 */
import { and, asc, count, eq, inArray } from 'drizzle-orm';

import { purchaseDocuments, purchaseItems } from '../schema.js';
import { listPurchases, type ListPurchasesFilter } from './purchase-reads.js';

import type { PurchaseRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

/**
 * An order as a LIST renders it.
 *
 * The two extras are computed here rather than left to the caller because the
 * alternative is a round trip per row. A consumer building a scrollable list —
 * the mobile one especially — would otherwise fetch the page and then fetch
 * every order in it to count its lines, which is the shape that makes a list
 * either slow or thumbnail-less.
 */
export interface PurchaseListRow {
  readonly purchase: PurchaseRow;
  readonly itemCount: number;
  /**
   * The `pops://` URI of the order's first receipt-kind document, or `null`
   * when it has none — an order ingested from an export bundle rather than
   * photographed usually does.
   *
   * First by `(createdAt, id)`, matching the order `getPurchase` returns
   * documents in, so "the receipt for this order" means the same thing in a
   * list row and in the detail behind it. A multi-part receipt stores one
   * document per photograph and this names the first, which is the top of the
   * till slip.
   */
  readonly receiptUri: string | null;
}

/**
 * One page of list rows, with both aggregates resolved in two queries rather
 * than in 2N.
 *
 * They are scoped to the ids ON THE PAGE, not to the filter: an aggregate over
 * the whole filter would be a table scan per scroll tick, and every row it
 * produced for an order the page does not carry would be thrown away.
 */
export function listPurchaseRows(
  db: PurchasesDb,
  filter: ListPurchasesFilter = {}
): readonly PurchaseListRow[] {
  const page = listPurchases(db, filter);
  if (page.length === 0) return [];

  const ids = page.map((purchase) => purchase.id);

  const counts = new Map<string, number>(
    db
      .select({ purchaseId: purchaseItems.purchaseId, itemCount: count() })
      .from(purchaseItems)
      .where(inArray(purchaseItems.purchaseId, ids))
      .groupBy(purchaseItems.purchaseId)
      .all()
      .map((row) => [row.purchaseId, row.itemCount])
  );

  // Every receipt document on the page, in the order `getPurchase` returns
  // them, and the FIRST per order wins. Ordering here rather than picking with
  // an aggregate keeps the tie-break identical to the detail read's.
  const receipts = new Map<string, string>();
  for (const row of db
    .select({ purchaseId: purchaseDocuments.purchaseId, uri: purchaseDocuments.documentUri })
    .from(purchaseDocuments)
    .where(and(inArray(purchaseDocuments.purchaseId, ids), eq(purchaseDocuments.kind, 'receipt')))
    .orderBy(asc(purchaseDocuments.createdAt), asc(purchaseDocuments.id))
    .all()) {
    if (!receipts.has(row.purchaseId)) receipts.set(row.purchaseId, row.uri);
  }

  return page.map((purchase) => ({
    purchase,
    itemCount: counts.get(purchase.id) ?? 0,
    receiptUri: receipts.get(purchase.id) ?? null,
  }));
}

/**
 * Reading an order's charges and the links hanging off them.
 *
 * Split from `purchase-reads.ts` for the same reason the write path splits
 * into `purchase-write-items.ts` — this is the largest single query in that
 * file, and keeping it here leaves both readable.
 */
import { asc, eq, inArray } from 'drizzle-orm';

import { purchaseChargeLinks, purchaseCharges, purchaseItemAllocations } from '../schema.js';
import { groupBy } from './group-by.js';

import type { PurchasesDb } from '../index.js';
import type { PurchaseChargeDetail } from './purchase-reads.js';

export function selectChargeDetails(
  db: PurchasesDb,
  purchaseId: string
): readonly PurchaseChargeDetail[] {
  const rows = db
    .select()
    .from(purchaseCharges)
    .where(eq(purchaseCharges.purchaseId, purchaseId))
    .orderBy(asc(purchaseCharges.position), asc(purchaseCharges.id))
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const linkRows = db
    .select()
    .from(purchaseChargeLinks)
    .where(inArray(purchaseChargeLinks.chargeId, ids))
    .orderBy(asc(purchaseChargeLinks.createdAt), asc(purchaseChargeLinks.id))
    .all();
  const allocationRows = db
    .select()
    .from(purchaseItemAllocations)
    .where(inArray(purchaseItemAllocations.chargeId, ids))
    .orderBy(asc(purchaseItemAllocations.createdAt), asc(purchaseItemAllocations.id))
    .all();

  const linksByCharge = groupBy(linkRows, (row) => row.chargeId);
  const allocationsByCharge = groupBy(allocationRows, (row) => row.chargeId);

  return rows.map((charge) => ({
    charge,
    links: linksByCharge.get(charge.id) ?? [],
    allocations: allocationsByCharge.get(charge.id) ?? [],
  }));
}

/**
 * Every line carrying a given tag, across every order. The query
 * `purchase_item_tags` exists to serve — a JSON array column would answer
 * it only with a full scan.
 */

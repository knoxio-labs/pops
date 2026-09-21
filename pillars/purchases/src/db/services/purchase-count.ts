/**
 * The size of a whole scope, not a page of it.
 *
 * Split out from `purchase-reads.ts` rather than living beside
 * `listPurchases`, which it mirrors, only because that file is at the
 * pillar's line cap — the two are still one concern and share
 * `purchaseFilterConditions`.
 */
import { and, count } from 'drizzle-orm';

import { purchases } from '../schema.js';
import { purchaseFilterConditions, type PurchaseScopeFilter } from './purchase-reads.js';

import type { PurchasesDb } from './internal.js';

/**
 * Count of the whole scope a filter denotes. Meant to be called once per
 * query, not once per page fetch — the caller in the REST list route
 * enforces that; this function has no opinion about when it is called.
 */
export function countPurchases(db: PurchasesDb, filter: PurchaseScopeFilter = {}): number {
  const conditions = [...purchaseFilterConditions(filter)];
  const base = db.select({ value: count() }).from(purchases);
  const filtered = conditions.length > 0 ? base.where(and(...conditions)) : base;
  return filtered.all()[0]?.value ?? 0;
}

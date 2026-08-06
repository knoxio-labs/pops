/**
 * The snapshot the solver runs on.
 *
 * Reads only. The solver is a pure function of what this returns, so the
 * queries here decide what it can possibly see — a filter applied wrongly
 * is indistinguishable, from the solver's side, from the data not existing.
 */
import { and, eq, gte, isNotNull, isNull, lte, ne } from 'drizzle-orm';

import { purchaseChargeLinks, purchaseCharges, purchases, purchaseSources } from '../schema.js';

import type { ConfirmedLink, SolvableCharge } from '../../reconcile/types.js';
import type { PurchasesDb } from './internal.js';

export interface ReconcileScope {
  /** Inclusive lower bound on `orderedAt` (ISO-8601). */
  readonly from?: string;
  /** Inclusive upper bound on `orderedAt` (ISO-8601). */
  readonly to?: string;
  /** Restrict to one source. Omitted sweeps everything. */
  readonly source?: string;
}

/**
 * Every charge eligible for matching in scope, joined to its order and the
 * order's source settings.
 *
 * **Cash orders are excluded.** `settlementMode='cash'` is terminal — no
 * transaction will ever exist for it — so including one would put a
 * permanently unmatchable charge in the review queue every night, which is
 * exactly the false alarm that teaches someone to stop reading the queue
 * (ADR-042).
 *
 * Ignored orders are excluded for the same reason: the user has said they
 * do not want to see them.
 */
export function listSolvableCharges(db: PurchasesDb, scope: ReconcileScope = {}): SolvableCharge[] {
  const rows = db
    .select({
      id: purchaseCharges.id,
      purchaseId: purchaseCharges.purchaseId,
      position: purchaseCharges.position,
      amountCents: purchaseCharges.amountCents,
      role: purchaseCharges.role,
      orderedAt: purchases.orderedAt,
      descriptorPattern: purchaseSources.descriptorPattern,
      settlementWindowDays: purchaseSources.settlementWindowDays,
    })
    .from(purchaseCharges)
    .innerJoin(purchases, eq(purchaseCharges.purchaseId, purchases.id))
    .leftJoin(purchaseSources, eq(purchases.source, purchaseSources.id))
    .where(
      and(
        ne(purchases.settlementMode, 'cash'),
        ne(purchases.status, 'ignored'),
        scope.source === undefined ? undefined : eq(purchases.source, scope.source),
        scope.from === undefined ? undefined : gte(purchases.orderedAt, scope.from),
        scope.to === undefined ? undefined : lte(purchases.orderedAt, scope.to)
      )
    )
    .all();

  return rows.map((row) => ({
    id: row.id,
    purchaseId: row.purchaseId,
    position: row.position,
    amountCents: row.amountCents,
    role: row.role,
    orderedAt: row.orderedAt,
    descriptorPattern: row.descriptorPattern,
    settlementWindowDays: row.settlementWindowDays,
  }));
}

/**
 * Orders in scope that state no charge at all.
 *
 * Every Amazon order is one of these: the DSAR export publishes no charge
 * breakdown, so without a minted `derived` charge the entire backfill has
 * nothing to match and sits at 100% unexplained forever.
 */
export function listOrdersNeedingDerivedCharge(
  db: PurchasesDb,
  scope: ReconcileScope = {}
): { id: string; totalCents: number; orderedAt: string; currency: string }[] {
  // A left join with a null charge id is the "has no charge" predicate, and
  // it stays one query — the alternative, filtering in JS against a second
  // read, re-runs that read per row.
  return db
    .select({
      id: purchases.id,
      totalCents: purchases.totalCents,
      orderedAt: purchases.orderedAt,
      currency: purchases.currency,
    })
    .from(purchases)
    .leftJoin(purchaseCharges, eq(purchaseCharges.purchaseId, purchases.id))
    .where(
      and(
        isNull(purchaseCharges.id),
        ne(purchases.settlementMode, 'cash'),
        ne(purchases.status, 'ignored'),
        // Non-zero only: a zero-total order has nothing to settle, and a
        // derived charge for zero would match nothing while adding a row.
        ne(purchases.totalCents, 0),
        scope.source === undefined ? undefined : eq(purchases.source, scope.source),
        scope.from === undefined ? undefined : gte(purchases.orderedAt, scope.from),
        scope.to === undefined ? undefined : lte(purchases.orderedAt, scope.to)
      )
    )
    .all();
}

/**
 * Every human-confirmed link. Pinned: never revised, and each removes both
 * its charge and its transaction from the solvable set.
 *
 * Read fleet-wide rather than per scope, deliberately. A confirmed link
 * outside the swept window still owns its transaction, and a sweep that
 * could not see it would happily re-link that transaction to something
 * else.
 */
export function listConfirmedLinks(db: PurchasesDb): ConfirmedLink[] {
  return db
    .select({
      chargeId: purchaseChargeLinks.chargeId,
      transactionUri: purchaseChargeLinks.transactionUri,
    })
    .from(purchaseChargeLinks)
    .where(isNotNull(purchaseChargeLinks.confirmedAt))
    .all();
}

/**
 * The snapshot the solver runs on.
 *
 * Reads only. The solver is a pure function of what this returns, so the
 * queries here decide what it can possibly see — a filter applied wrongly
 * is indistinguishable, from the solver's side, from the data not existing.
 */
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne } from 'drizzle-orm';

import {
  purchaseChargeLinks,
  purchaseCharges,
  purchaseLinkRejections,
  purchases,
  purchaseSources,
} from '../schema.js';

import type { ConfirmedLink, RejectedPairing, SolvableCharge } from '../../reconcile/types.js';
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
 * Orders in scope whose charges say nothing about what was paid.
 *
 * Every Amazon order is one of these: the DSAR export publishes no charge
 * breakdown, so without a minted `derived` charge the entire backfill has
 * nothing to match and sits at 100% unexplained forever. A refunded order
 * qualifies as much as an untouched one — a refund states what came back
 * and never what was paid — and a predicate reading "has no charge row"
 * instead silently excluded every one of them, permanently.
 *
 * `refund` is the only role that leaves an order eligible, and the three
 * that exclude it do not do so for one reason. `capture` and `adjustment`
 * each claim part of the total, and what gets minted is the full total, so
 * minting alongside one drives the residual negative — an over-explained
 * order, which is a worse lie than an unexplained one. `authorization`
 * claims none of it (`isResidualBearing` is false for that role, so an
 * authorization-only order reads as a full residual and minting would in
 * fact resolve it); it is held out because an authorization is the
 * merchant's own record of a payment whose capture the merchant states
 * itself, and a minted second record of that one payment would leave two
 * near-identical charges competing for one transaction. No adapter emits
 * that role, so the case has never been exercised against real data.
 */
export function listOrdersNeedingDerivedCharge(
  db: PurchasesDb,
  scope: ReconcileScope = {}
): {
  id: string;
  totalCents: number;
  orderedAt: string;
  currency: string;
  settlementWindowDays: number | null;
}[] {
  // A left join with a null charge id is the anti-join, and it stays one
  // query — the alternative, filtering in JS against a second read, re-runs
  // that read per row. The role filter has to live in the join condition:
  // in the WHERE it would be applied to the null row the anti-join is made
  // of, which matches nothing.
  return db
    .select({
      id: purchases.id,
      totalCents: purchases.totalCents,
      orderedAt: purchases.orderedAt,
      currency: purchases.currency,
      settlementWindowDays: purchaseSources.settlementWindowDays,
    })
    .from(purchases)
    .leftJoin(purchaseSources, eq(purchases.source, purchaseSources.id))
    .leftJoin(
      purchaseCharges,
      and(eq(purchaseCharges.purchaseId, purchases.id), ne(purchaseCharges.role, 'refund'))
    )
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

/**
 * Pairings a human ruled out, for the charges about to be solved.
 *
 * Scoped to the charges rather than read fleet-wide, which is the opposite
 * of {@link listConfirmedLinks} and for a reason that does not apply here.
 * A confirmed link outside the window still OWNS its transaction, so a
 * sweep blind to it would re-link that transaction elsewhere. A rejection
 * owns nothing — it only says two rows are not a pair — so one for a charge
 * outside the window cannot affect anything inside it.
 */
export function listRejectedPairings(
  db: PurchasesDb,
  chargeIds: readonly string[]
): RejectedPairing[] {
  if (chargeIds.length === 0) return [];
  return db
    .select({
      chargeId: purchaseLinkRejections.chargeId,
      transactionUri: purchaseLinkRejections.transactionUri,
    })
    .from(purchaseLinkRejections)
    .where(inArray(purchaseLinkRejections.chargeId, [...chargeIds]))
    .all();
}

/**
 * Deriving `purchases.status` from an order's charge links.
 *
 * The reconcile sweep, and the confirm/reject/unlink decisions, all write
 * `purchase_charge_links` rows without ever touching `purchases.status` —
 * so every order sits at whatever status it was created with (almost always
 * `awaiting_settlement`) no matter how thoroughly it later gets linked.
 * This is the one place that turns a set of links back into a status, so
 * every write path calls the same rule instead of five approximations of it.
 *
 * **The rule (Joao, 2026-09-25).** Automatic links count — confirmation is
 * not required, matching how `computeAccounting` already treats a link
 * regardless of `confirmedAt`. An order whose links fully cover its total is
 * `linked`; one whose links cover only part of it is `partial`; one with no
 * covering links stays `awaiting_settlement`. `settled_cash` and `ignored`
 * are set by a person or another process, not derived from links, so they
 * are never overwritten here.
 *
 * **Coverage** is `computeAccounting`'s `matchedCents` — the sum of
 * `capture`/`adjustment` charges that carry at least one link. `refund` and
 * `authorization` charges are excluded from coverage the same way they are
 * excluded from the residual: a refund is money that came back, not money
 * that paid for the order, and an authorization is a hold rather than a
 * settlement. An order with a refund that otherwise nets to zero residual
 * (its capture is fully linked) reads as `linked`, not `partial` — the
 * refund does not subtract from coverage, exactly as it does not add to
 * the residual.
 */
import { inArray } from 'drizzle-orm';

import { purchaseCharges, purchaseChargeLinks, purchases } from '../schema.js';
import { computeAccounting } from './accounting.js';
import { groupBy } from './group-by.js';
import { setPurchaseStatus } from './purchase-reads.js';
import { queryChunked } from './sqlite-chunk.js';

import type { PurchaseStatus } from '../../contract/constants.js';
import type { PurchaseChargeLinkRow, PurchaseChargeRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

/** Statuses set by a person or another process, never by link coverage. */
const STATUSES_NOT_DERIVED: ReadonlySet<PurchaseStatus> = new Set(['settled_cash', 'ignored']);

/**
 * One order's status, from its current status, its total, and its charges'
 * links.
 *
 * Pure — no database access — so the rule above is testable directly
 * against hand-built charge/link snapshots, and reusable from both the
 * live write paths and the backfill migration's TypeScript twin (the
 * migration itself is SQL, but the two must agree, and this is what a test
 * pins them against).
 */
export function deriveStatus(
  currentStatus: PurchaseStatus,
  totalCents: number,
  charges: readonly PurchaseChargeRow[],
  linksByChargeId: ReadonlyMap<string, readonly PurchaseChargeLinkRow[]>
): PurchaseStatus {
  if (STATUSES_NOT_DERIVED.has(currentStatus)) return currentStatus;

  const { matchedCents } = computeAccounting(totalCents, charges, linksByChargeId);
  if (matchedCents <= 0) return 'awaiting_settlement';
  return matchedCents >= totalCents ? 'linked' : 'partial';
}

/**
 * Recompute and persist status for every order named in `purchaseIds`.
 *
 * Reads each order's current charges and links fresh from `db` — a caller
 * inside a transaction gets a view that includes writes made earlier in
 * that same transaction — and writes only the orders whose derived status
 * differs from what is stored, through {@link setPurchaseStatus} so a
 * status change this makes is indistinguishable from one any other engine
 * write makes.
 *
 * Returns how many orders actually changed, which is what a sweep result
 * or a backfill report wants to show — not how many were checked.
 */
export function recomputePurchaseStatuses(db: PurchasesDb, purchaseIds: readonly string[]): number {
  const ids = [...new Set(purchaseIds)];
  if (ids.length === 0) return 0;

  const purchaseRows = queryChunked(ids, (chunk) =>
    db
      .select({ id: purchases.id, status: purchases.status, totalCents: purchases.totalCents })
      .from(purchases)
      .where(inArray(purchases.id, [...chunk]))
      .all()
  );
  if (purchaseRows.length === 0) return 0;

  const chargeRows = queryChunked(ids, (chunk) =>
    db
      .select()
      .from(purchaseCharges)
      .where(inArray(purchaseCharges.purchaseId, [...chunk]))
      .all()
  );
  const chargeIds = chargeRows.map((row) => row.id);
  const linkRows = queryChunked(chargeIds, (chunk) =>
    db
      .select()
      .from(purchaseChargeLinks)
      .where(inArray(purchaseChargeLinks.chargeId, [...chunk]))
      .all()
  );

  const chargesByPurchase = groupBy(chargeRows, (row) => row.purchaseId);
  const linksByCharge = groupBy(linkRows, (row) => row.chargeId);

  let changed = 0;
  for (const row of purchaseRows) {
    const charges = chargesByPurchase.get(row.id) ?? [];
    const linksByChargeId = new Map(
      charges.map((charge) => [charge.id, linksByCharge.get(charge.id) ?? []])
    );
    const next = deriveStatus(row.status, row.totalCents, charges, linksByChargeId);
    if (next !== row.status) {
      setPurchaseStatus(db, row.id, next);
      changed++;
    }
  }
  return changed;
}

/**
 * Recompute status for whichever orders own `chargeIds`.
 *
 * The confirm/reject/unlink decisions know only the charge they acted on,
 * not its order — this is the lookup that lets them call
 * {@link recomputePurchaseStatuses} anyway, in the same transaction as the
 * link write that may have changed the order's coverage.
 */
export function recomputeStatusForCharges(db: PurchasesDb, chargeIds: readonly string[]): number {
  const ids = [...new Set(chargeIds)];
  if (ids.length === 0) return 0;

  const rows = queryChunked(ids, (chunk) =>
    db
      .select({ purchaseId: purchaseCharges.purchaseId })
      .from(purchaseCharges)
      .where(inArray(purchaseCharges.id, [...chunk]))
      .all()
  );
  return recomputePurchaseStatuses(
    db,
    rows.map((row) => row.purchaseId)
  );
}

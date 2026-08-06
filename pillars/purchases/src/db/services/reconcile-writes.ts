/**
 * The sweep's writes: tear down, mint, persist.
 *
 * Everything here runs inside one transaction per sweep. A sweep that tore
 * down links and then failed before writing the replacements would leave
 * every order in its window looking unpaid, which is worse than not having
 * swept at all.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { purchaseChargeLinks, purchaseCharges } from '../schema.js';
import { expectRow, type PurchasesDb } from './internal.js';

import type { ProposedLink } from '../../reconcile/types.js';

/**
 * Delete every UNCONFIRMED link belonging to the given charges.
 *
 * This is the teardown half of re-derivation: unconfirmed links are
 * disposable, so the sweep discards them and re-solves from scratch rather
 * than trying to patch them into agreement with new evidence. Patching is
 * what makes late-arriving data a race; discarding makes arrival order
 * irrelevant by construction (ADR-042).
 *
 * A confirmed link is never touched. `confirmedAt IS NULL` is the whole
 * predicate, and the schema carries an index for exactly this query.
 */
export function tearDownUnconfirmedLinks(db: PurchasesDb, chargeIds: readonly string[]): number {
  if (chargeIds.length === 0) return 0;

  return db
    .delete(purchaseChargeLinks)
    .where(
      and(
        inArray(purchaseChargeLinks.chargeId, [...chargeIds]),
        isNull(purchaseChargeLinks.confirmedAt)
      )
    )
    .run().changes;
}

/**
 * Mint the `derived` charge for an order whose source states none.
 *
 * Amazon's export publishes no charge breakdown, so without this every one
 * of its 748 orders has nothing for the solver to match against. The charge
 * records what the order says it cost; `origin='derived'` marks it as the
 * engine's inference rather than a figure the merchant stated, so a later
 * ingest that DOES state charges can be told apart from this.
 *
 * Idempotent by construction: the caller only asks for orders that have no
 * charge at all, so a second sweep finds this one and does not mint a twin.
 * Once minted the row persists — teardown removes links, never charges,
 * because a charge is a fact about the order rather than a guess about the
 * statement.
 */
export function mintDerivedCharge(
  db: PurchasesDb,
  order: { id: string; totalCents: number; currency: string }
): string {
  const rows = db
    .insert(purchaseCharges)
    .values({
      purchaseId: order.id,
      position: 0,
      // Settlement and order currency are the same here by construction:
      // the figure comes from the order itself, not from a statement, so
      // there is no FX leg to represent.
      currency: order.currency,
      amountCents: order.totalCents,
      orderAmountCents: order.totalCents,
      role: 'capture',
      origin: 'derived',
    })
    .returning({ id: purchaseCharges.id })
    .all();

  return expectRow(rows, 'mintDerivedCharge').id;
}

/**
 * Write the solver's proposals.
 *
 * Every link lands with `confirmedAt` NULL — the engine proposes, a human
 * confirms. Nothing here may write a confirmation, which is what keeps the
 * next sweep free to reconsider its own work.
 *
 * `onConflictDoNothing` covers the one race worth surviving: two sweeps
 * overlapping on the same charge and transaction. The unique constraint is
 * `(chargeId, transactionUri)`, so the loser silently keeps the winner's
 * identical row rather than failing the whole transaction.
 */
export function persistProposedLinks(db: PurchasesDb, links: readonly ProposedLink[]): number {
  if (links.length === 0) return 0;

  let written = 0;
  for (const link of links) {
    written += db
      .insert(purchaseChargeLinks)
      .values({
        chargeId: link.chargeId,
        transactionUri: link.transactionUri,
        amountCents: link.amountCents,
        linkType: link.linkType,
        confidence: link.confidence,
      })
      .onConflictDoNothing()
      .run().changes;
  }
  return written;
}

/** Charge ids belonging to the given orders, for scoping a teardown. */
export function chargeIdsForPurchases(db: PurchasesDb, purchaseIds: readonly string[]): string[] {
  if (purchaseIds.length === 0) return [];
  return db
    .select({ id: purchaseCharges.id })
    .from(purchaseCharges)
    .where(inArray(purchaseCharges.purchaseId, [...purchaseIds]))
    .all()
    .map((row) => row.id);
}

/**
 * Remove one link entirely, confirmed or not.
 *
 * Un-pinning rather than rejecting: the next sweep is free to re-derive it,
 * and probably will. Rejecting a proposal *so that it stays rejected* needs
 * somewhere to remember the decision, which is `purchase_match_rules` and
 * therefore POPS-1309 — a reject that the next sweep silently undoes would
 * be worse than no reject at all.
 */
export function unlinkCharge(db: PurchasesDb, chargeId: string, transactionUri: string): boolean {
  return (
    db
      .delete(purchaseChargeLinks)
      .where(
        and(
          eq(purchaseChargeLinks.chargeId, chargeId),
          eq(purchaseChargeLinks.transactionUri, transactionUri)
        )
      )
      .run().changes > 0
  );
}

/** Confirm a link, pinning it against every future re-derivation. */
export function confirmLink(
  db: PurchasesDb,
  chargeId: string,
  transactionUri: string,
  nowIso: string
): boolean {
  return (
    db
      .update(purchaseChargeLinks)
      .set({ confirmedAt: nowIso })
      .where(
        and(
          eq(purchaseChargeLinks.chargeId, chargeId),
          eq(purchaseChargeLinks.transactionUri, transactionUri)
        )
      )
      .run().changes > 0
  );
}

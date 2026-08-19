/**
 * The sweep's writes: tear down, mint, persist.
 *
 * Everything here runs inside one transaction per sweep. A sweep that tore
 * down links and then failed before writing the replacements would leave
 * every order in its window looking unpaid, which is worse than not having
 * swept at all.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  purchaseChargeLinks,
  purchaseCharges,
  purchaseLinkRejections,
  purchases,
} from '../schema.js';
import { expectRow, type PurchasesDb } from './internal.js';
import { recordMatchRule } from './match-rules.js';

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
 * Idempotent by construction: minting is what removes the order from
 * `listOrdersNeedingDerivedCharge`'s work set, not the other way around.
 * That query selects orders with no charge claiming any of the total, and
 * the row minted here is exactly such a claim — so a second sweep never
 * selects this order again and never mints a twin.
 * Once minted the row persists — teardown removes links, never charges,
 * because a charge is a fact about the order rather than a guess about the
 * statement.
 *
 * The full total even for an order that already carries a refund. A refund
 * is money that came back, which `computeAccounting` keeps out of the
 * residual identity entirely, so netting it off here would understate what
 * was paid and leave the difference unexplained forever.
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
        transactionDescription: link.transactionDescription,
        amountCents: link.amountCents,
        linkType: link.linkType,
        confidence: link.confidence,
        matchRuleId: link.matchRuleId,
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
 * Remove one link entirely, confirmed or not, remembering nothing.
 *
 * Un-pinning rather than rejecting: the next sweep is free to re-derive it,
 * and probably will. That is the whole difference from {@link rejectLink},
 * and both exist because they answer different questions — "this pin was a
 * mistake, reconsider it" against "these two are not a pair".
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

/**
 * Rule a pairing out for good: drop the link and remember the decision.
 *
 * The rejection is what survives. Deleting alone is `unlinkCharge`, whose
 * effect the next sweep undoes; the row in `purchase_link_rejections` is
 * what the solver's blocking stage consults so the pairing is never
 * proposed again.
 *
 * Both writes share one transaction. A delete that landed without its
 * rejection would present as a working reject that quietly reverts on the
 * next sweep — the exact failure this replaces.
 *
 * False means there was no such link, which the route reports rather than
 * swallowing: the user acted on a proposal a sweep has since re-derived
 * away, and telling them it was rejected would be a lie they discover when
 * it reappears.
 */
export function rejectLink(
  db: PurchasesDb,
  chargeId: string,
  transactionUri: string,
  nowIso: string
): boolean {
  return db.transaction((tx) => {
    const removed = unlinkCharge(tx, chargeId, transactionUri);
    if (!removed) return false;

    tx.insert(purchaseLinkRejections)
      .values({ chargeId, transactionUri, rejectedAt: nowIso })
      // Deciding the same way twice is the same decision. The pair is the
      // primary key, so the second reject keeps the first one's timestamp
      // rather than restating it.
      .onConflictDoNothing()
      .run();

    return true;
  });
}

/** What a confirm did, beyond pinning. */
export interface ConfirmOutcome {
  /** False when no such link exists — the queue was read before a sweep. */
  readonly pinned: boolean;
  /**
   * The rule this link is attributed to: the one that admitted it when
   * stage 4 proposed it, otherwise the one this decision just taught.
   *
   * Null is a normal outcome, not a failure — the descriptor may carry no
   * pattern worth keying on, and a link proposed before descriptors were
   * recorded carries none at all.
   */
  readonly matchRuleId: string | null;
}

/**
 * Confirm a link: pin it, and teach the matcher what the pin was about.
 *
 * Pinning alone is what shipped first, and it answers one charge forever
 * while telling the engine nothing about the merchant that produced it — so
 * the hundredth order from the same source asks the same question the first
 * one did. The rule written here is the durable half: a descriptor pattern
 * scoped to the order's source, which is a claim that outlives the link.
 *
 * `matchRuleId` on the link is what ties the two together, and it is what a
 * later reader needs to explain a link by naming the rule behind it rather
 * than asserting one exists. A confirm fills it in; it never revises one a
 * stage-4 proposal already wrote, because those name different things — the
 * rule that admitted this descriptor against the rule this decision teaches.
 *
 * **Confirming an already-confirmed link does nothing.** Not defensive
 * coding: without it a double-click records a second application of a rule
 * that explained nothing new, and `timesApplied` — a history that is never
 * revised downward — would carry that forever. The decision is already
 * recorded, so reporting it as made is honest.
 */
export function confirmLink(
  db: PurchasesDb,
  chargeId: string,
  transactionUri: string,
  nowIso: string
): ConfirmOutcome {
  return db.transaction((tx) => {
    const found = tx
      .select({
        transactionDescription: purchaseChargeLinks.transactionDescription,
        confidence: purchaseChargeLinks.confidence,
        confirmedAt: purchaseChargeLinks.confirmedAt,
        matchRuleId: purchaseChargeLinks.matchRuleId,
        source: purchases.source,
        entityId: purchases.merchantEntityId,
        entityName: purchases.merchantEntityName,
      })
      .from(purchaseChargeLinks)
      .innerJoin(purchaseCharges, eq(purchaseCharges.id, purchaseChargeLinks.chargeId))
      .innerJoin(purchases, eq(purchases.id, purchaseCharges.purchaseId))
      .where(
        and(
          eq(purchaseChargeLinks.chargeId, chargeId),
          eq(purchaseChargeLinks.transactionUri, transactionUri)
        )
      )
      .all();

    const link = found[0];
    if (link === undefined) return { pinned: false, matchRuleId: null };
    if (link.confirmedAt !== null) return { pinned: true, matchRuleId: link.matchRuleId };

    const recorded = recordMatchRule(tx, {
      transactionDescription: link.transactionDescription,
      source: link.source,
      entityId: link.entityId,
      entityName: link.entityName,
      confidence: link.confidence,
    });

    // A link proposed by stage 4 already names the rule that admitted its
    // descriptor, and that is the attribution the reader needs: the rule
    // this link happened BECAUSE of. `recordMatchRule` keys on the exact
    // normalised descriptor, so for a `contains` or `regex` rule it is a
    // different row, and overwriting here would silently re-attribute the
    // link to a rule that had nothing to do with proposing it.
    const matchRuleId = link.matchRuleId ?? recorded;

    tx.update(purchaseChargeLinks)
      .set({ confirmedAt: nowIso, matchRuleId })
      .where(
        and(
          eq(purchaseChargeLinks.chargeId, chargeId),
          eq(purchaseChargeLinks.transactionUri, transactionUri)
        )
      )
      .run();

    return { pinned: true, matchRuleId };
  });
}

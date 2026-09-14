/**
 * A link a human states rather than one a sweep derived.
 *
 * `confirmLink` can only pin a link that already exists, so a charge the
 * sweep matched wrongly, or not at all, had no way to reach the transaction
 * that actually settled it. This writes that link directly, already
 * confirmed, after checking the claim against the transaction finance holds.
 */
import { and, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import { comparableAmountCents } from '../../reconcile/currency.js';
import { purchaseChargeLinks, purchaseCharges, purchaseLinkRejections } from '../schema.js';

import type { SolvableTransaction } from '../../reconcile/types.js';
import type { PurchasesDb } from './internal.js';

/** What the caller asked for. `amountCents` is a positive magnitude. */
export interface ManualLinkRequest {
  readonly chargeId: string;
  readonly amountCents?: number;
}

/** Why a manual link was or was not written. */
export type ManualLinkOutcome =
  | { readonly kind: 'linked'; readonly amountCents: number }
  | { readonly kind: 'charge-not-found' }
  | { readonly kind: 'already-linked' }
  | { readonly kind: 'incomparable-currency' }
  | { readonly kind: 'wrong-direction' }
  | { readonly kind: 'mixed-currency-claims' }
  | { readonly kind: 'transaction-claimed' }
  | { readonly kind: 'exceeds-charge'; readonly remainingCents: number }
  | { readonly kind: 'exceeds-transaction'; readonly unclaimedCents: number };

type Refusal = Exclude<ManualLinkOutcome, { kind: 'linked' } | { kind: 'charge-not-found' }>;

interface ChargeFacts {
  readonly amountCents: number;
  readonly currency: string;
}

function confirmedLinks(db: PurchasesDb, scope: SQL | undefined): { count: number; cents: number } {
  const [row] = db
    .select({
      count: sql<number>`COUNT(*)`,
      cents: sql<number>`COALESCE(SUM(ABS(${purchaseChargeLinks.amountCents})), 0)`,
    })
    .from(purchaseChargeLinks)
    .where(and(scope, isNotNull(purchaseChargeLinks.confirmedAt)))
    .all();
  return { count: row?.count ?? 0, cents: row?.cents ?? 0 };
}

/**
 * Confirmed claims on a transaction, per currency of the charge that made
 * them. A link's amount is stated in its own charge's currency, so claims in
 * different currencies cannot be summed without a rate nobody recorded.
 */
function claimsOn(
  db: PurchasesDb,
  transactionUri: string
): readonly { currency: string; cents: number }[] {
  return db
    .select({
      currency: sql<string>`UPPER(${purchaseCharges.currency})`,
      cents: sql<number>`SUM(ABS(${purchaseChargeLinks.amountCents}))`,
    })
    .from(purchaseChargeLinks)
    .innerJoin(purchaseCharges, eq(purchaseCharges.id, purchaseChargeLinks.chargeId))
    .where(
      and(
        eq(purchaseChargeLinks.transactionUri, transactionUri),
        isNotNull(purchaseChargeLinks.confirmedAt)
      )
    )
    .groupBy(sql`UPPER(${purchaseCharges.currency})`)
    .all();
}

/** The unsigned amount to link, or why the pairing is refused. */
function judge(
  db: PurchasesDb,
  request: ManualLinkRequest,
  charge: ChargeFacts,
  transaction: SolvableTransaction
): Refusal | { readonly kind: 'accepted'; readonly amountCents: number } {
  const pair = and(
    eq(purchaseChargeLinks.chargeId, request.chargeId),
    eq(purchaseChargeLinks.transactionUri, transaction.uri)
  );
  if (confirmedLinks(db, pair).count > 0) return { kind: 'already-linked' };

  const transactionCents = comparableAmountCents(charge, transaction);
  if (transactionCents === null) return { kind: 'incomparable-currency' };
  if (transactionCents === 0 || Math.sign(transactionCents) === Math.sign(charge.amountCents)) {
    return { kind: 'wrong-direction' };
  }

  const claims = claimsOn(db, transaction.uri);
  if (claims.some((claim) => claim.currency !== charge.currency.toUpperCase())) {
    return { kind: 'mixed-currency-claims' };
  }
  const unclaimedCents =
    Math.abs(transactionCents) - claims.reduce((sum, claim) => sum + claim.cents, 0);
  if (unclaimedCents <= 0) return { kind: 'transaction-claimed' };

  const remainingCents = Math.max(
    0,
    Math.abs(charge.amountCents) -
      confirmedLinks(db, eq(purchaseChargeLinks.chargeId, request.chargeId)).cents
  );
  const amountCents = request.amountCents ?? Math.min(remainingCents, unclaimedCents);
  if (amountCents <= 0 || amountCents > remainingCents) {
    return { kind: 'exceeds-charge', remainingCents };
  }
  if (amountCents > unclaimedCents) return { kind: 'exceeds-transaction', unclaimedCents };
  return { kind: 'accepted', amountCents };
}

function writeLink(
  db: PurchasesDb,
  {
    chargeId,
    transaction,
    signedCents,
    nowIso,
  }: {
    chargeId: string;
    transaction: SolvableTransaction;
    signedCents: number;
    nowIso: string;
  }
): void {
  db.delete(purchaseChargeLinks)
    .where(and(eq(purchaseChargeLinks.chargeId, chargeId), isNull(purchaseChargeLinks.confirmedAt)))
    .run();
  db.delete(purchaseLinkRejections)
    .where(
      and(
        eq(purchaseLinkRejections.chargeId, chargeId),
        eq(purchaseLinkRejections.transactionUri, transaction.uri)
      )
    )
    .run();
  db.insert(purchaseChargeLinks)
    .values({
      chargeId,
      transactionUri: transaction.uri,
      transactionDescription: transaction.description,
      amountCents: signedCents,
      linkType: 'manual',
      confidence: 1,
      matchRuleId: null,
      confirmedAt: nowIso,
    })
    .run();
}

/**
 * Write a confirmed `manual` link from a charge to a finance transaction.
 *
 * Money has to flow the opposite way on each side: a capture (positive
 * charge) is settled by money leaving an account (negative transaction), a
 * refund by money arriving. A same-direction pair is refused, which is the
 * mistake that paired captures with gift-card top-ups on 2026-09-14.
 *
 * Both limits count **confirmed** links only. Derived links are guesses the
 * next sweep discards, so they cannot make a human's statement over-claim;
 * the charge's own derived links are deleted here instead, since a stated
 * answer supersedes them. A rejection recorded for this exact pair is
 * removed too, because the human has now decided the opposite.
 *
 * No match rule is learned. A manual link is by definition a pairing the
 * matcher got wrong, often through an account (a gift card, a store-credit
 * wallet) whose descriptor says nothing about the merchant.
 */
export function linkChargeManually(
  db: PurchasesDb,
  request: ManualLinkRequest,
  transaction: SolvableTransaction,
  nowIso: string
): ManualLinkOutcome {
  return db.transaction((tx) => {
    const [charge] = tx
      .select({ amountCents: purchaseCharges.amountCents, currency: purchaseCharges.currency })
      .from(purchaseCharges)
      .where(eq(purchaseCharges.id, request.chargeId))
      .all();
    if (charge === undefined) return { kind: 'charge-not-found' };

    const verdict = judge(tx, request, charge, transaction);
    if (verdict.kind !== 'accepted') return verdict;

    const signedCents = charge.amountCents < 0 ? -verdict.amountCents : verdict.amountCents;
    writeLink(tx, { chargeId: request.chargeId, transaction, signedCents, nowIso });
    return { kind: 'linked', amountCents: signedCents };
  });
}

/**
 * The bank-match half of the mobile purchase detail (POPS-4646): how much of
 * an order the bank statements have proven, and which transactions did it.
 *
 * Its own file for the reason `mobile-purchases-schemas.ts` split out of
 * `rest-schemas.ts`: one screen section's shapes, kept under the line cap.
 */
import { z } from 'zod';

/**
 * `purchases`' accounting split, mirrored field for field (ADR-040 forbids
 * importing it). Integer cents.
 *
 * The identity the producer guarantees and a phone may rely on:
 * `totalCents === matchedCents + awaitingImportCents + residualCents`, with
 * `refundedCents` orthogonal and `netSpendCents === totalCents -
 * refundedCents`. `awaitingImportCents` is money whose statement has not
 * been imported yet — normal for a recent order, and not the same fact as
 * `residualCents`, which is money nothing explains.
 */
export const MobilePurchaseAccountingSchema = z.object({
  totalCents: z.int(),
  matchedCents: z.int(),
  awaitingImportCents: z.int(),
  residualCents: z.int(),
  /** A positive magnitude: `1179` reads as "$11.79 came back". */
  refundedCents: z.int().min(0),
  netSpendCents: z.int(),
});

export type MobilePurchaseAccounting = z.infer<typeof MobilePurchaseAccountingSchema>;

/**
 * How a link came to exist. `automatic` is the reconcile sweep's own match,
 * never looked at by a person; `confirmed` is one a person accepted or made.
 * Closed because bfm derives it (from the link's `confirmedAt`) rather than
 * relaying a producer vocabulary.
 */
export const MOBILE_MATCH_METHODS = ['automatic', 'confirmed'] as const;

/**
 * The bank transaction a link points at, as finance describes it. Present
 * only when bfm's one batched finance read answered for this transaction;
 * `null` on the match otherwise, and the phone falls back to the link's own
 * amount.
 */
export const MobileMatchedTransactionSchema = z.object({
  /** The statement descriptor, verbatim. */
  description: z.string(),
  /** The statement day, `YYYY-MM-DD`, as finance stores it. */
  date: z.string(),
  /**
   * Decimal dollars in finance's own sign convention (spend is negative),
   * mirrored rather than converted — the same reason the transactions leg
   * mirrors it. May differ from the match's `amountCents` when one
   * transaction pays several charges.
   */
  amount: z.number(),
  /**
   * ISO 4217 of `amount` — the transaction's account currency, falling back
   * to `FALLBACK_MOBILE_CURRENCY` when finance's account list did not answer,
   * exactly as the transactions leg does (POPS-3571).
   */
  currency: z.string(),
  /** The account's display name, or null when finance's account list did not answer. */
  accountName: z.string().nullable(),
});

export type MobileMatchedTransaction = z.infer<typeof MobileMatchedTransactionSchema>;

/** One link between a charge and a bank transaction. */
export const MobileChargeMatchSchema = z.object({
  /** The link's own id. */
  id: z.string(),
  /** Finance's transaction id, or null when the link's reference is not a finance transaction. */
  transactionId: z.string().nullable(),
  /** How much of the charge this link accounts for, integer cents. */
  amountCents: z.int(),
  matchedBy: z.enum(MOBILE_MATCH_METHODS),
  transaction: MobileMatchedTransactionSchema.nullable(),
});

export type MobileChargeMatch = z.infer<typeof MobileChargeMatchSchema>;

/** One payment the order expects to see on a statement, and what matched it. */
export const MobilePurchaseChargeSchema = z.object({
  id: z.string(),
  /** Integer cents in `currency`. */
  amountCents: z.int(),
  currency: z.string(),
  /** `capture`, `authorization`, `refund`, `adjustment` — open, verbatim from `purchases`. */
  role: z.string(),
  /** `merchant` (the source stated it) or `derived` (the pillar inferred it) — open, verbatim. */
  origin: z.string(),
  /**
   * The day the merchant says it charged, at the order's own offset — the
   * same derivation as the purchase's `orderedOn`. Null when the source
   * stated no charge time.
   */
  chargedOn: z.string().nullable(),
  /** Oldest first. Empty for a charge nothing has matched yet. */
  matches: z.array(MobileChargeMatchSchema),
});

export type MobilePurchaseCharge = z.infer<typeof MobilePurchaseChargeSchema>;

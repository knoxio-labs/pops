/**
 * What the linked orders add up to, against the transaction on screen.
 *
 * The point of computing this at all is the residual. `GET /reconcile/links`
 * answers which orders touch a transaction, not whether they explain all of
 * it, and a panel that listed the orders and stopped would turn "$412.80 of
 * this $520 charge is unexplained" into a view that looks complete. Like the
 * merchant lens's unexplained bucket, it is never clamped: a negative
 * `unaccountedCents` means the links claim more than the transaction is
 * worth, which is a real defect worth seeing rather than one to floor at zero.
 */
import type { LinkedPurchase } from './types.js';

const CENTS_PER_DOLLAR = 100;

export interface SettlementSummary {
  readonly orderCount: number;
  /** Σ of every link's amount, as a magnitude. */
  readonly linkedCents: number;
  /** The transaction's own amount, as a magnitude. */
  readonly transactionCents: number;
  /** `transactionCents − linkedCents`. Negative means over-claimed. */
  readonly unaccountedCents: number;
  /**
   * What the amounts are in.
   *
   * Taken from the first charge: a charge's currency is the account's, every
   * charge here settles the one transaction, and nothing else in the payload
   * names that transaction's currency at all — finance publishes a bare
   * number.
   */
  readonly currency: string;
}

/**
 * Finance publishes decimal dollars; purchases counts in integer cents.
 * Rounds rather than truncates, matching finance's own conversion: `19.99`
 * has no exact IEEE-754 representation and truncating lands a cent short,
 * which would show up here as a phantom one-cent residual.
 */
function dollarsToCents(dollars: number): number {
  return Math.round(dollars * CENTS_PER_DOLLAR);
}

/**
 * Sums link amounts and the transaction amount as **magnitudes**.
 *
 * The two sides carry their own sign conventions, and the matcher only ever
 * pairs a charge with a transaction of the same sign, so comparing magnitudes
 * asks the question a reader has — how much of this is accounted for — without
 * depending on which way either side happens to sign an expense.
 *
 * Returns null when nothing is linked: there is no residual to report about a
 * transaction no order claims, only an empty answer.
 */
export function summariseSettlement(
  entries: readonly LinkedPurchase[],
  transactionAmount: number
): SettlementSummary | null {
  const currency = entries.flatMap((entry) => entry.charges)[0]?.charge.currency;
  if (currency === undefined) return null;

  // Each order's share is the server's own `linkedCents` rather than a
  // re-sum of its links: the field exists precisely so a combined settlement
  // has one implementation of that arithmetic, and re-deriving it here would
  // make two.
  const linkedCents = entries.reduce((sum, entry) => sum + Math.abs(entry.linkedCents), 0);
  const transactionCents = Math.abs(dollarsToCents(transactionAmount));

  return {
    orderCount: entries.length,
    linkedCents,
    transactionCents,
    unaccountedCents: transactionCents - linkedCents,
    currency,
  };
}

/**
 * True when at least one of this order's links is the matcher's belief rather
 * than a human decision, so the card can say so once at the top instead of
 * leaving a reader to spot it per charge.
 */
export function hasUnconfirmedLink(entry: LinkedPurchase): boolean {
  return entry.charges.some((charge) => charge.link.confirmedAt === null);
}

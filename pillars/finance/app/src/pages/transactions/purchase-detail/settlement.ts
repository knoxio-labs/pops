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

/** A residual could be computed: every linked charge settled in one currency. */
export interface SettledSummary {
  readonly kind: 'settled';
  readonly orderCount: number;
  /** Σ of every link's amount, as a magnitude. */
  readonly linkedCents: number;
  /** The transaction's own amount, as a magnitude. */
  readonly transactionCents: number;
  /** `transactionCents − linkedCents`. Negative means over-claimed. */
  readonly unaccountedCents: number;
  /**
   * What the amounts are in — the currency the charges settled in, which is
   * the only currency named anywhere in the payload. Finance publishes a bare
   * number, so the transaction's own currency is not knowable here.
   */
  readonly currency: string;
}

/** Charges settled in more than one currency, so there is no total to state. */
export interface MixedCurrencySummary {
  readonly kind: 'mixed-currency';
  readonly orderCount: number;
  /** Every distinct charge currency, in the order the payload listed them. */
  readonly currencies: readonly string[];
}

export type SettlementSummary = SettledSummary | MixedCurrencySummary;

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
 * Each side is summed with its own signs intact and only the two totals are
 * compared as magnitudes, so a refund linked beside a capture cancels the way
 * the arithmetic says it should instead of being added to it. The matcher only
 * pairs same-signed amounts today, but `manual` is in the shipped link-type
 * enum and that guard lives entirely in the producer.
 *
 * Refuses to add across currencies, for the reason the merchant lens's
 * per-currency grouping exists: there is no such number, and inventing one
 * produces an integer that means nothing and looks authoritative. The charge
 * currency is the producer's *settlement* currency, which it defaults from the
 * order and does not promise matches the card's — so a mixed set is reported
 * as mixed rather than summed under whichever code happened to come first.
 *
 * Returns null when nothing is linked: there is no residual to report about a
 * transaction no order claims, only an empty answer.
 */
export function summariseSettlement(
  entries: readonly LinkedPurchase[],
  transactionAmount: number
): SettlementSummary | null {
  const currencies = [
    ...new Set(entries.flatMap((entry) => entry.charges).map((charge) => charge.charge.currency)),
  ];
  const [currency] = currencies;
  if (currency === undefined) return null;

  const orderCount = entries.length;
  if (currencies.length > 1) return { kind: 'mixed-currency', orderCount, currencies };

  // Each order's share is the server's own `linkedCents` rather than a
  // re-sum of its links: the field exists precisely so a combined settlement
  // has one implementation of that arithmetic, and re-deriving it here would
  // make two.
  const linkedCents = Math.abs(entries.reduce((sum, entry) => sum + entry.linkedCents, 0));
  const transactionCents = Math.abs(dollarsToCents(transactionAmount));

  return {
    kind: 'settled',
    orderCount,
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

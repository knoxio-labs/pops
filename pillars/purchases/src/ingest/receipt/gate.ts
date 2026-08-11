/**
 * The check that makes a model's reading admissible as fact.
 *
 * A vision model reading a crumpled thermal receipt is right most of the
 * time and confidently wrong the rest. What makes that acceptable here — and
 * unacceptable in `reconcile/`, where matching is arithmetic and a model
 * would hallucinate a plausible partition — is that a receipt states its own
 * answer. The lines have to add up to the total the paper prints.
 *
 * So this is not a confidence score, and there is no threshold to tune. It
 * is arithmetic against a figure the model also had to read, which is the
 * point: getting the sum to agree by accident requires the model to have
 * misread the total in exactly the way it misread the lines.
 *
 * A failure is never a rejection. The purchase is still real and the photo
 * still exists; it goes to review with the discrepancy stated, because
 * `awaiting_settlement` and "we could not read it" must not look alike.
 */
import { parseAmountCents, type MoneyLocale } from '../money.js';

import type { ExtractedReceipt } from './extraction.js';

/**
 * Tolerance for the sum, under either tax convention.
 *
 * Zero, and for the same reason as the Woolworths adapter: a receipt prints
 * exactly what was tendered. A tolerance here would be a place for a misread
 * digit to hide — and a single misread digit is worth at least ten cents,
 * so any tolerance large enough to absorb rounding is large enough to absorb
 * an error.
 */
const TOLERANCE_CENTS = 0;

export type GateFailure =
  | { readonly kind: 'unreadable-total'; readonly detail: string }
  | { readonly kind: 'unreadable-line'; readonly detail: string }
  | { readonly kind: 'no-lines'; readonly detail: string }
  | { readonly kind: 'negative-line'; readonly detail: string }
  | { readonly kind: 'sum-mismatch'; readonly detail: string; readonly deltaCents: number }
  | { readonly kind: 'damaged'; readonly detail: string };

export interface GateResult {
  /** True only when every line parsed and the arithmetic agrees exactly. */
  readonly admissible: boolean;
  readonly totalCents: number | null;
  readonly lineTotalCents: number;
  readonly taxCents: number;
  readonly discountCents: number;
  /** Fees the merchant added — a card surcharge, a small-order fee. */
  readonly surchargeCents: number;
  /**
   * Stated delivery, kept apart from {@link GateResult.surchargeCents} so
   * `purchases.shippingCents` can answer what delivery cost.
   *
   * The split is the model's and **this gate cannot check it**. Both terms
   * enter the sum with the same sign, so a delivery fee filed as a
   * surcharge produces an identical total and an identical verdict. That is
   * the same species of blind spot as a reading whose amounts are right and
   * whose product names are wrong: the arithmetic is proven, the filing is
   * not, and nothing here claims otherwise.
   */
  readonly shippingCents: number;
  /**
   * True when the stated tax was already inside the line prices — which is
   * what made the sum agree. The figure is then a statement about the
   * total, not a component of it, and adding it again would overstate the
   * purchase by exactly the tax.
   */
  readonly taxIncluded: boolean;
  /** Everything wrong with it, not just the first thing. */
  readonly failures: readonly GateFailure[];
}

function sumAmounts(
  amounts: readonly string[],
  locale: MoneyLocale,
  onUnreadable: (amount: string) => void
): number {
  return amounts.reduce((total, amount) => {
    const cents = parseAmountCents(amount, locale);
    if (cents === null) {
      onUnreadable(amount);
      return total;
    }
    return total + Math.abs(cents);
  }, 0);
}

/**
 * Total the product lines, recording anything that is not one.
 *
 * A negative amount is readable but misfiled: `discounts` is the channel
 * for a reduction, and it normalises the sign. A negative sitting among the
 * lines still sums correctly against the stated total — that is exactly the
 * danger, since nothing else here would object — while the purchase it
 * produces carries an item worth less than nothing.
 */
function sumLines(
  lines: ExtractedReceipt['lines'],
  locale: MoneyLocale,
  failures: GateFailure[]
): number {
  let total = 0;
  for (const [index, line] of lines.entries()) {
    const cents = parseAmountCents(line.amount, locale);
    if (cents === null) {
      failures.push({
        kind: 'unreadable-line',
        detail: `line ${String(index + 1)} "${line.description}" has amount "${line.amount}", which is not money`,
      });
      continue;
    }
    if (cents < 0) {
      failures.push({
        kind: 'negative-line',
        detail:
          `line ${String(index + 1)} "${line.description}" is negative (${line.amount}); ` +
          'a discount belongs in `discounts`, not among the lines',
      });
    }
    total += cents;
  }
  return total;
}

interface Totals {
  readonly totalCents: number | null;
  readonly lineTotalCents: number;
  readonly taxCents: number;
  readonly discountCents: number;
  readonly surchargeCents: number;
  readonly shippingCents: number;
}

/**
 * Check the receipt's arithmetic against both conventions for stated tax.
 *
 * Two exist and both are ordinary. Australia, the UK and the EU print
 * prices with tax already in them and state the tax as a fact about the
 * total — a $30.00 Kmart receipt lists $30.00 of lines and $2.73 of GST,
 * because 30.00/11 is the GST inside it. The United States prints prices
 * without tax and adds it, so the lines come to less than the total.
 *
 * Which one applies is not something to infer from the merchant, the
 * currency or the address: the receipt's own numbers say, and exactly one
 * of the two can reconcile unless the tax is zero, when they are the same
 * sum. So both are tried and the paper decides.
 */
function reconcile(totals: Totals): { taxIncluded: boolean; failure: GateFailure | null } {
  const { totalCents, lineTotalCents, taxCents, discountCents } = totals;
  if (totalCents === null) return { taxIncluded: false, failure: null };

  const net = lineTotalCents - discountCents + totals.surchargeCents + totals.shippingCents;
  const inclusiveDelta = net - totalCents;
  const exclusiveDelta = net + taxCents - totalCents;

  if (Math.abs(inclusiveDelta) <= TOLERANCE_CENTS) return { taxIncluded: true, failure: null };
  if (Math.abs(exclusiveDelta) <= TOLERANCE_CENTS) return { taxIncluded: false, failure: null };

  // Report against whichever convention came closer, since that is the one
  // the receipt was probably printed under and the delta a reviewer needs.
  const closerIsInclusive = Math.abs(inclusiveDelta) <= Math.abs(exclusiveDelta);
  const delta = closerIsInclusive ? inclusiveDelta : exclusiveDelta;
  return {
    taxIncluded: false,
    failure: {
      kind: 'sum-mismatch',
      deltaCents: delta,
      detail:
        `lines total ${String(lineTotalCents)}c less ${String(discountCents)}c discounts ` +
        `plus ${String(totals.surchargeCents)}c surcharges plus ` +
        `${String(totals.shippingCents)}c shipping is ${String(net)}c, or ` +
        `${String(net + taxCents)}c with the stated ${String(taxCents)}c of tax added, ` +
        `but the receipt states ${String(totalCents)}c`,
    },
  };
}

/**
 * Decide whether an extraction may be written as fact.
 *
 * Stated tax is tried both ways — see {@link reconcile}. Which convention a
 * receipt was printed under is something its own numbers answer, so nothing
 * here has to know which country it came from.
 */
export function gateExtraction(extracted: ExtractedReceipt): GateResult {
  const failures: GateFailure[] = [];

  // The receipt's own currency decides `1,495` — see `../money.ts`.
  const locale: MoneyLocale = { currency: extracted.currency };
  const totalCents = parseAmountCents(extracted.total, locale);
  if (totalCents === null) {
    failures.push({
      kind: 'unreadable-total',
      detail: `the stated total "${extracted.total}" is not money`,
    });
  }

  const lineTotalCents = sumLines(extracted.lines, locale, failures);

  if (extracted.lines.length === 0) {
    failures.push({
      kind: 'no-lines',
      // A receipt with a total and no lines reconciles trivially against
      // nothing, which would let the emptiest possible reading through.
      detail: 'no line items were read, so there is nothing for the total to agree with',
    });
  }

  const taxCents = sumAmounts(extracted.tax === null ? [] : [extracted.tax], locale, (amount) =>
    failures.push({ kind: 'unreadable-line', detail: `stated tax "${amount}" is not money` })
  );
  const discountCents = sumAmounts(extracted.discounts, locale, (amount) =>
    failures.push({ kind: 'unreadable-line', detail: `stated discount "${amount}" is not money` })
  );
  const surchargeCents = sumAmounts(extracted.surcharges, locale, (amount) =>
    failures.push({ kind: 'unreadable-line', detail: `stated surcharge "${amount}" is not money` })
  );
  const shippingCents = sumAmounts(
    extracted.shipping === null ? [] : [extracted.shipping],
    locale,
    (amount) =>
      failures.push({ kind: 'unreadable-line', detail: `stated shipping "${amount}" is not money` })
  );

  for (const note of extracted.unreadable) {
    failures.push({ kind: 'damaged', detail: `the model could not read: ${note}` });
  }

  const reconciliation = reconcile({
    totalCents,
    lineTotalCents,
    taxCents,
    discountCents,
    surchargeCents,
    shippingCents,
  });
  if (reconciliation.failure !== null) failures.push(reconciliation.failure);

  return {
    admissible: failures.length === 0,
    totalCents,
    lineTotalCents,
    taxCents,
    discountCents,
    surchargeCents,
    shippingCents,
    taxIncluded: reconciliation.taxIncluded,
    failures,
  };
}

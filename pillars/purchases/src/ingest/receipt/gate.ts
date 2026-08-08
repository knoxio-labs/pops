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
 * Tolerance for `Σ lines − discounts + tax === total`.
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

/**
 * Decide whether an extraction may be written as fact.
 *
 * Tax is added rather than assumed included. A receipt that separates tax
 * has lines that exclude it; one that does not separate it reports no tax at
 * all, and the sum works either way without this having to know which
 * country's convention applies.
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

  for (const note of extracted.unreadable) {
    failures.push({ kind: 'damaged', detail: `the model could not read: ${note}` });
  }

  if (totalCents !== null) {
    const delta = lineTotalCents + taxCents - discountCents - totalCents;
    if (Math.abs(delta) > TOLERANCE_CENTS) {
      failures.push({
        kind: 'sum-mismatch',
        deltaCents: delta,
        detail:
          `lines total ${String(lineTotalCents)}c plus ${String(taxCents)}c tax ` +
          `less ${String(discountCents)}c discounts is ${String(lineTotalCents + taxCents - discountCents)}c, ` +
          `but the receipt states ${String(totalCents)}c`,
      });
    }
  }

  return {
    admissible: failures.length === 0,
    totalCents,
    lineTotalCents,
    taxCents,
    discountCents,
    failures,
  };
}

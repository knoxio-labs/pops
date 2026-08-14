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
 * point: a reading that is wrong and still agrees has to be wrong about the
 * total in exactly the way it is wrong about the lines.
 *
 * With one exception, and it is a smaller coincidence than that. Stated tax
 * is tried both ways (see {@link reconcile}), so a single extraction error
 * of exactly the stated tax satisfies the convention the receipt was not
 * printed under. Half of that is caught — see {@link duplicatesTheStatedTax}
 * — and the other half cannot be, because its evidence is a component that
 * is not there.
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
  | { readonly kind: 'ambiguous-tax'; readonly detail: string }
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

/**
 * Every amount that parsed, kept apart rather than accumulated.
 *
 * The sum is what the arithmetic needs; the individual figures are what
 * {@link duplicatesTheStatedTax} needs, and it cannot recover them from a
 * total. The sign is normalised for the reason it always has been: a
 * reduction is printed both ways and means one thing either way.
 */
function readAmounts(
  amounts: readonly string[],
  locale: MoneyLocale,
  onUnreadable: (amount: string) => void
): number[] {
  const read: number[] = [];
  for (const amount of amounts) {
    const cents = parseAmountCents(amount, locale);
    if (cents === null) {
      onUnreadable(amount);
      continue;
    }
    read.push(Math.abs(cents));
  }
  return read;
}

function sumOf(amounts: readonly number[]): number {
  return amounts.reduce((total, cents) => total + cents, 0);
}

/**
 * Read the product lines, recording anything that is not one.
 *
 * Signs are kept as read, unlike {@link readAmounts}: a negative line is
 * refused rather than quietly turned into a positive one.
 *
 * A negative amount is readable but misfiled: `discounts` is the channel
 * for a reduction, and it normalises the sign. A negative sitting among the
 * lines still sums correctly against the stated total — that is exactly the
 * danger, since nothing else here would object — while the purchase it
 * produces carries an item worth less than nothing.
 */
function readLines(
  lines: ExtractedReceipt['lines'],
  locale: MoneyLocale,
  failures: GateFailure[]
): number[] {
  const read: number[] = [];
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
    read.push(cents);
  }
  return read;
}

interface Totals {
  readonly totalCents: number | null;
  readonly lineTotalCents: number;
  readonly taxCents: number;
  readonly discountCents: number;
  readonly surchargeCents: number;
  readonly shippingCents: number;
  /**
   * Every figure that entered the sum on the added side — each line, each
   * surcharge, the delivery charge — one entry per figure the model
   * reported, so an amount stated twice appears twice.
   */
  readonly addedCents: readonly number[];
}

/**
 * Whether the same amount was added twice and is exactly the stated tax.
 *
 * This is the one shape in which a wrong reading can satisfy the wrong tax
 * convention and still leave evidence. A model that files one fee in two
 * fields — in `shipping` and in `surcharges`, or in `shipping` and again as
 * the line it was printed on — overstates the added side by that fee. When
 * the fee equals the stated tax, the overstatement is exactly what the
 * exclusive convention would have added, so the components land on the
 * stated total and the receipt reads as tax-inclusive. Both readings then
 * produce the same total from the same figures, and nothing on the paper
 * says which one the receipt is.
 *
 * Two occurrences rather than one, and that is the whole precision of it. A
 * single component equal to the tax is ordinary — a tax-inclusive receipt
 * states a tax of total/11, and on a long shop some line lands on it by
 * coincidence — so refusing those would spend a reviewer's attention on
 * arithmetic that is not in doubt. A *repeated* one is the fingerprint of
 * the same money filed twice, which is the error nothing else here can see.
 *
 * A repeat sitting entirely among the lines counts, and that is a choice. It
 * is the shape a receipt photographed in overlapping frames produces — the
 * prompt says a line appearing in two images is one line, and the arithmetic
 * is the backstop for when it is reported twice anyway. The cost is that two
 * genuinely identical items priced at exactly the stated tax go to review;
 * the alternative is being blind to an over-count on the intake most likely
 * to produce one. Two identical coffees and an overlap artefact are the same
 * bytes, which is why deduplicating them in code was refused as well — the
 * ambiguity is real, and review is where a real ambiguity belongs.
 *
 * The mirror case is not detectable and does not pretend to be: a model
 * that drops a component understates the added side, and if what it dropped
 * equalled the stated tax, the exclusive branch reconciles instead. The
 * evidence for that is a figure that is absent, which is exactly what a
 * receipt that never charged it also looks like.
 */
function duplicatesTheStatedTax(addedCents: readonly number[], taxCents: number): boolean {
  if (taxCents <= 0) return false;
  return addedCents.filter((cents) => cents === taxCents).length >= 2;
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
 *
 * Trying both is also the one place a wrong reading can reconcile, since an
 * extraction error of exactly the stated tax satisfies the other
 * convention. See {@link duplicatesTheStatedTax} for the half of that which
 * leaves evidence, and for the half which does not.
 */
function reconcile(totals: Totals): { taxIncluded: boolean; failure: GateFailure | null } {
  const { totalCents, lineTotalCents, taxCents, discountCents } = totals;
  if (totalCents === null) return { taxIncluded: false, failure: null };

  const net = lineTotalCents - discountCents + totals.surchargeCents + totals.shippingCents;
  const inclusiveDelta = net - totalCents;
  const exclusiveDelta = net + taxCents - totalCents;

  if (Math.abs(inclusiveDelta) <= TOLERANCE_CENTS) {
    if (!duplicatesTheStatedTax(totals.addedCents, taxCents)) {
      return { taxIncluded: true, failure: null };
    }
    return {
      taxIncluded: false,
      failure: {
        kind: 'ambiguous-tax',
        detail:
          `the components add to ${String(net)}c, the stated total, with the stated ` +
          `${String(taxCents)}c of tax already inside the prices — but ${String(taxCents)}c ` +
          'is also added twice, so counting it once and adding the tax gives the same ' +
          `${String(net)}c. Two readings of the same figures, and the receipt does not ` +
          'say which of them it is',
      },
    };
  }
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
 * Turn every figure the receipt states into cents, naming each one it could
 * not.
 *
 * Split out because it is the only part of the gate that touches strings.
 * What it returns is arithmetic, and every decision taken on the far side of
 * it — reconciling, choosing a tax convention, refusing an ambiguous one —
 * is arithmetic too.
 */
function readTotals(
  extracted: ExtractedReceipt,
  locale: MoneyLocale,
  failures: GateFailure[]
): Totals {
  const totalCents = parseAmountCents(extracted.total, locale);
  if (totalCents === null) {
    failures.push({
      kind: 'unreadable-total',
      detail: `the stated total "${extracted.total}" is not money`,
    });
  }

  const lineCents = readLines(extracted.lines, locale, failures);

  const taxCents = sumOf(
    readAmounts(extracted.tax === null ? [] : [extracted.tax], locale, (amount) =>
      failures.push({ kind: 'unreadable-line', detail: `stated tax "${amount}" is not money` })
    )
  );
  const discountCents = sumOf(
    readAmounts(extracted.discounts, locale, (amount) =>
      failures.push({ kind: 'unreadable-line', detail: `stated discount "${amount}" is not money` })
    )
  );
  const surchargeAmounts = readAmounts(extracted.surcharges, locale, (amount) =>
    failures.push({ kind: 'unreadable-line', detail: `stated surcharge "${amount}" is not money` })
  );
  const shippingAmounts = readAmounts(
    extracted.shipping === null ? [] : [extracted.shipping],
    locale,
    (amount) =>
      failures.push({ kind: 'unreadable-line', detail: `stated shipping "${amount}" is not money` })
  );
  return {
    totalCents,
    lineTotalCents: sumOf(lineCents),
    taxCents,
    discountCents,
    surchargeCents: sumOf(surchargeAmounts),
    shippingCents: sumOf(shippingAmounts),
    addedCents: [...lineCents, ...surchargeAmounts, ...shippingAmounts],
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
  const totals = readTotals(extracted, locale, failures);

  if (extracted.lines.length === 0) {
    failures.push({
      kind: 'no-lines',
      // A receipt with a total and no lines reconciles trivially against
      // nothing, which would let the emptiest possible reading through.
      detail: 'no line items were read, so there is nothing for the total to agree with',
    });
  }

  for (const note of extracted.unreadable) {
    failures.push({ kind: 'damaged', detail: `the model could not read: ${note}` });
  }

  const reconciliation = reconcile(totals);
  if (reconciliation.failure !== null) failures.push(reconciliation.failure);

  return {
    admissible: failures.length === 0,
    totalCents: totals.totalCents,
    lineTotalCents: totals.lineTotalCents,
    taxCents: totals.taxCents,
    discountCents: totals.discountCents,
    surchargeCents: totals.surchargeCents,
    shippingCents: totals.shippingCents,
    taxIncluded: reconciliation.taxIncluded,
    failures,
  };
}

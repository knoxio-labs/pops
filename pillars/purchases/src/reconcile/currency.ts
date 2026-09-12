/**
 * Comparing a charge's amount against a transaction's when the two are not
 * necessarily in the same currency.
 *
 * A receipt photographed abroad is priced in the merchant's currency; the
 * card charge settles in AUD, at a rate nobody recorded, plus a conversion
 * fee. Comparing those two numbers is not a comparison at all — the only
 * equality available is the foreign amount the issuer itself printed, in
 * the currency it printed it in. Finance captures exactly that
 * (`foreignAmountMinor`, `foreignCurrency`), so the honest test is
 * receipt-currency against foreign-currency, and the settlement figure is
 * never converted.
 *
 * Two consequences follow, and both are the point rather than side effects:
 *
 * - **The conversion fee cannot cause a mismatch.** It is an AUD fee, and a
 *   cross-currency comparison never looks at the AUD side, so it makes no
 *   difference whether the issuer folded it into the row or billed it as a
 *   row of its own. Nothing here reads `fxFeeCents`.
 * - **A pair with no honest comparison is refused, not approximated.**
 *   `null` means "these two amounts cannot be compared", which blocking
 *   turns into "not a candidate". A BRL total that coincidentally equals an
 *   AUD one is therefore not a near-match that slipped through a tolerance;
 *   it is never considered.
 */
import type { SolvableCharge, SolvableTransaction } from './types.js';

/**
 * The scale every amount in this pillar is stored at.
 *
 * `ingest/money.ts` reads a printed price as whole units times 100 plus a
 * two-digit fraction, for every currency and without consulting one — so a
 * ¥1,200 receipt is stored as `120000`, not as the 1200 minor units ISO-4217
 * gives the yen. Finance stores the issuer's own minor units. The two
 * conventions agree for the two-decimal currencies and diverge everywhere
 * else, which is what {@link rescaleToChargeUnits} exists to reconcile.
 */
const CHARGE_MINOR_EXPONENT = 2;

const EXPONENT_CACHE = new Map<string, number | null>();

/**
 * ISO-4217 minor-unit exponent for a currency, from the platform's own
 * currency data rather than a hand-kept table that would rot.
 *
 * An unrecognised but well-formed code reads as 2, which is not a guess
 * dressed up as data: it is precisely the assumption this pillar's receipt
 * parser already makes about the same code, so both sides of the comparison
 * stay in the same convention. A malformed code throws, and is refused.
 */
function minorExponentOf(currency: string): number | null {
  const code = currency.toUpperCase();
  const cached = EXPONENT_CACHE.get(code);
  if (cached !== undefined) return cached;

  let exponent: number | null;
  try {
    // Optional in the type, always present for `style: 'currency'` — where
    // it is the currency's ISO-4217 exponent rather than a display choice.
    exponent =
      new Intl.NumberFormat('en-AU', { style: 'currency', currency: code }).resolvedOptions()
        .maximumFractionDigits ?? null;
  } catch {
    exponent = null;
  }
  EXPONENT_CACHE.set(code, exponent);
  return exponent;
}

/**
 * A figure in `currency`'s own minor units, restated at the scale this
 * pillar stores charges at.
 *
 * Only a widening is allowed. A currency with more than two decimals is
 * refused rather than divided, because the charge it would be compared
 * against was rounded to two decimals when the receipt was read — the digit
 * the division needs is not missing from this function, it is missing from
 * the stored charge, and inventing it would manufacture an equality.
 */
function rescaleToChargeUnits(amountMinor: number, currency: string): number | null {
  const exponent = minorExponentOf(currency);
  if (exponent === null || exponent > CHARGE_MINOR_EXPONENT) return null;
  return Math.abs(amountMinor) * 10 ** (CHARGE_MINOR_EXPONENT - exponent);
}

function sameCurrency(left: string, right: string): boolean {
  return left.toUpperCase() === right.toUpperCase();
}

/**
 * The transaction's amount expressed in the charge's currency, or `null`
 * when no such figure exists.
 *
 * Three outcomes, and the third is the one that matters:
 *
 * 1. **Same currency** — the settlement amount, unchanged, compared to the
 *    cent exactly as before. Nothing about the foreign path widens this.
 * 2. **The transaction carries the charge's currency as its foreign one** —
 *    the amount the issuer says was charged abroad, rescaled to this
 *    pillar's convention, signed by the settlement row. Every importer
 *    records the foreign amount as a magnitude, so the direction of the
 *    money is read from the side that states one.
 * 3. **Anything else** — refused. A cross-currency pair whose transaction
 *    has no foreign amount is not a weak match, it is no evidence at all:
 *    the row says what left the account in AUD and says nothing about what
 *    was paid abroad.
 */
export function comparableAmountCents(
  charge: SolvableCharge,
  transaction: SolvableTransaction
): number | null {
  if (sameCurrency(charge.currency, transaction.settlementCurrency)) {
    return transaction.amountCents;
  }

  const { foreignCurrency, foreignAmountMinor } = transaction;
  if (foreignCurrency === null || foreignAmountMinor === null) return null;
  if (!sameCurrency(charge.currency, foreignCurrency)) return null;

  const magnitude = rescaleToChargeUnits(foreignAmountMinor, foreignCurrency);
  if (magnitude === null) return null;
  return transaction.amountCents < 0 ? -magnitude : magnitude;
}

/** A candidate paired with the amount the ladder may compare it on. */
export interface ComparableCandidate {
  readonly transaction: SolvableTransaction;
  /** {@link comparableAmountCents}, in the charge's currency. */
  readonly amountCents: number;
}

/**
 * Drop the candidates that cannot be compared with this charge and pair the
 * rest with the amount to compare them on.
 *
 * Blocking already refuses those candidates, so in a full sweep this drops
 * nothing. It is applied again in each stage because the stages are
 * exported and tested on their own, and a stage that silently read a
 * settlement figure for a foreign charge would be wrong in exactly the way
 * this module exists to prevent.
 */
export function comparableCandidates(
  charge: SolvableCharge,
  candidates: readonly SolvableTransaction[]
): readonly ComparableCandidate[] {
  return candidates.flatMap((transaction) => {
    const amountCents = comparableAmountCents(charge, transaction);
    return amountCents === null ? [] : [{ transaction, amountCents }];
  });
}

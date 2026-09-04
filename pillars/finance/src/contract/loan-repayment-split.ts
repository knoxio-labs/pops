/**
 * Pure interest/principal split arithmetic for an imported loan repayment
 * (POPS-2830, following the investigation at POPS-2818 Q5). Dependency-free
 * so the formula can be tested in isolation from the DB-aware commit
 * pipeline that calls it (`api/modules/imports/commit-loan-split.ts`).
 *
 * The split follows the existing `fee` precedent (`corrections-constants.ts`,
 * `transaction-classification.ts`'s `fee:interest` tag) rather than FX's
 * one-row-with-extra-columns approach: there is no splits table and no
 * `parent_transaction_id`, so a repayment becomes two ordinary rows — a
 * `fee`/`fee:interest` row and a `transfer` row — not one row carrying both
 * numbers.
 */

/**
 * Monthly interest on an outstanding balance: `|balance| × annual rate / 12`,
 * rounded to the nearest cent.
 *
 * `balanceCents` is signed (a `liability` account's balance is negative when
 * money is owed), but only its magnitude feeds the formula — interest accrues
 * on what is owed regardless of which sign convention represents that.
 */
export function computeLoanInterestCents(balanceCents: number, annualRatePct: number): number {
  return Math.round((Math.abs(balanceCents) * annualRatePct) / 100 / 12);
}

/** One imported repayment split into its interest and principal cents. */
export interface LoanRepaymentSplitAmounts {
  interestCents: number;
  principalCents: number;
}

/**
 * Split a repayment amount into interest (per {@link computeLoanInterestCents})
 * and the remaining principal.
 *
 * Interest is clamped to the repayment amount itself when the formula would
 * otherwise exceed it — a stale rate or a balance snapshot that predates a
 * large unrecorded charge. A principal leg pinned at zero cents is a far
 * safer failure than one that goes negative.
 */
export function splitLoanRepaymentAmounts(input: {
  repaymentAmountCents: number;
  balanceCents: number;
  annualRatePct: number;
}): LoanRepaymentSplitAmounts {
  const rawInterestCents = computeLoanInterestCents(input.balanceCents, input.annualRatePct);
  const interestCents = Math.min(rawInterestCents, input.repaymentAmountCents);
  return { interestCents, principalCents: input.repaymentAmountCents - interestCents };
}

/**
 * Suffix marking a synthetic interest-leg checksum as derived rather than
 * bank-supplied. A real checksum is always a 64-character SHA-256 hex digest
 * (`import-dedup.ts`), which this suffix can never collide with, so deriving
 * it from the original line's checksum is safe and — being a pure function of
 * that checksum — stable across re-imports of the same statement line.
 */
const LOAN_INTEREST_CHECKSUM_SUFFIX = ':loan-interest-split';

/**
 * The checksum stored on the synthetic interest leg, derived from the
 * original imported line's checksum. The principal/transfer leg keeps the
 * original checksum unchanged — it is what makes re-import dedup
 * (`findExistingChecksums`) recognise the whole split as already committed
 * without either leg needing a new column.
 */
export function deriveLoanInterestChecksum(originalChecksum: string): string {
  return `${originalChecksum}${LOAN_INTEREST_CHECKSUM_SUFFIX}`;
}

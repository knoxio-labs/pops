/**
 * Typed errors raised by the loan domain (POPS-2829) — `loan_terms`,
 * `loan_rate_history` and `loan_offset_links`. Split into their own file
 * rather than added to `account-errors.ts`, which is already at its line cap.
 * Re-exported from `errors.ts` so `from '../errors.js'` keeps working.
 *
 * The "this account is not a loan" case is NOT here: it reuses
 * `AccountKindMismatchError` from `account-errors.ts`, the same error the
 * gift-card kind gate throws, so one mapping in the API layer covers every
 * kind-gated extension table.
 */

export class LoanTermsNotFoundError extends Error {
  override readonly name = 'LoanTermsNotFoundError' as const;
  readonly accountId: string;

  constructor(accountId: string) {
    super(`Loan terms for account '${accountId}' not found`);
    this.accountId = accountId;
  }
}

/**
 * A rate write would not have been the loan's latest by `effective_from`.
 *
 * `loan_terms.annual_rate_pct` mirrors the latest rate history row, and this
 * ticket keeps that mirror honest the cheap way: a rate may only be recorded
 * strictly forward in time, so writing history and writing the column are
 * always the same decision. Accepting a backdated correction would mean
 * recomputing which row is latest and possibly leaving the column untouched —
 * real behaviour nothing needs yet. Lifting this restriction is what a
 * backdated-rate-correction ticket would do.
 *
 * `effectiveFrom` equal to `latestEffectiveFrom` is rejected too: with two
 * rows on the same date there is no "latest", so the column would have no
 * defined value to mirror.
 */
export class LoanRateNotLatestError extends Error {
  override readonly name = 'LoanRateNotLatestError' as const;
  readonly accountId: string;
  readonly effectiveFrom: string;
  readonly latestEffectiveFrom: string;

  constructor(accountId: string, effectiveFrom: string, latestEffectiveFrom: string) {
    super(
      `Rate effective '${effectiveFrom}' is not later than the latest recorded rate ` +
        `('${latestEffectiveFrom}') for loan account '${accountId}' — backdated rate ` +
        'corrections are not supported'
    );
    this.accountId = accountId;
    this.effectiveFrom = effectiveFrom;
    this.latestEffectiveFrom = latestEffectiveFrom;
  }
}

export class LoanOffsetLinkNotFoundError extends Error {
  override readonly name = 'LoanOffsetLinkNotFoundError' as const;
  readonly id: string;

  constructor(id: string) {
    super(`Loan offset link '${id}' not found`);
    this.id = id;
  }
}

/**
 * A second ACTIVE offset link was requested for a (loan, offset) pair that
 * already has one. Unlink the existing link first; the closed row stays on
 * the table and a fresh link can then be created.
 */
export class LoanOffsetLinkConflictError extends Error {
  override readonly name = 'LoanOffsetLinkConflictError' as const;
  readonly loanAccountId: string;
  readonly offsetAccountId: string;

  constructor(loanAccountId: string, offsetAccountId: string) {
    super(
      `Account '${offsetAccountId}' is already an active offset for loan account ` +
        `'${loanAccountId}'`
    );
    this.loanAccountId = loanAccountId;
    this.offsetAccountId = offsetAccountId;
  }
}

/**
 * A loan account cannot offset itself (POPS-2829/POPS-2863). Balance
 * offsetting only makes sense between two distinct accounts.
 */
export class LoanOffsetLinkSelfLinkError extends Error {
  override readonly name = 'LoanOffsetLinkSelfLinkError' as const;
  readonly loanAccountId: string;

  constructor(loanAccountId: string) {
    super(`Account '${loanAccountId}' cannot be its own offset account`);
    this.loanAccountId = loanAccountId;
  }
}

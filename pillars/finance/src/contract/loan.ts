/**
 * Storage shapes behind a `loan`-kind account (POPS-2829) — the enums the
 * `loan_terms`, `loan_rate_history` and `loan_offset_links` tables and their
 * REST contract (`rest-loan.ts`) share. Kept next to {@link ACCOUNT_KINDS}
 * (`account-kind.ts`) because they are the same layer: what a kind means,
 * declared once for the db schema and the wire alike.
 */

/**
 * Where a `loan_terms` row came from. `manual` is the only member: no
 * statement import supplies a principal, rate, term and repayment, so there
 * is nothing else that could have written one. It exists as an enum rather
 * than an implicit constant so a future importer adds a member here instead
 * of overloading `manual`.
 */
export const LOAN_TERMS_SOURCES = ['manual'] as const;

/** One member of {@link LOAN_TERMS_SOURCES}. */
export type LoanTermsSource = (typeof LOAN_TERMS_SOURCES)[number];

/**
 * Where a `loan_rate_history` row came from — `manual` for a rate typed in,
 * `imported` for one read off a lender statement. Unlike the terms above, a
 * statement genuinely can carry a rate change, so both members are reachable
 * today.
 */
export const LOAN_RATE_SOURCES = ['manual', 'imported'] as const;

/** One member of {@link LOAN_RATE_SOURCES}. */
export type LoanRateSource = (typeof LOAN_RATE_SOURCES)[number];

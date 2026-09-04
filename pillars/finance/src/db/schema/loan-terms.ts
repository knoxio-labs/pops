import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { LOAN_TERMS_SOURCES } from '../../contract/loan.js';
import { accounts } from './accounts.js';

/**
 * Extension row for a `loan`-kind account (POPS-2829). One row per account,
 * keyed by `account_id` itself rather than a synthetic id — a loan has
 * exactly one set of terms in force, so there is nothing a separate id would
 * disambiguate. Same shape as `account_gift_card_details`.
 *
 * `annual_rate_pct` is the loan's CURRENT rate, duplicated here from
 * `loan_rate_history`'s latest row on purpose: it is the field every read
 * wants, and joining to a per-loan max on every read to get it is worse than
 * keeping one column honest. `services/loan-terms.ts` owns that honesty — it
 * writes both sides in one transaction and rejects any rate not strictly
 * later than everything stored, so this column cannot fall behind history.
 *
 * `terms_effective_from` is when these terms took effect; `updated_at` is
 * when the row was last touched. The pair is what a staleness check reads —
 * terms effective years ago and never updated are the ones to distrust.
 *
 * Only a `loan`-kind account may have a row here — enforced at the service
 * layer, not by a SQL constraint, since SQLite can't express "this FK's
 * target row must have `kind = X`".
 */
export const loanTerms = sqliteTable('loan_terms', {
  accountId: text('account_id')
    .primaryKey()
    .references(() => accounts.id),
  /** Amount borrowed at origination, in integer cents (#3665, CF041). */
  originalPrincipalCents: integer('original_principal_cents').notNull(),
  /** Current annual rate as a percentage — `5.49` means 5.49% p.a. */
  annualRatePct: real('annual_rate_pct').notNull(),
  /** Full term of the loan in months, as originally contracted. */
  termMonths: integer('term_months').notNull(),
  /** Contracted repayment per month, in integer cents. */
  monthlyRepaymentCents: integer('monthly_repayment_cents').notNull(),
  /** ISO `YYYY-MM-DD` the loan itself started. */
  startedOn: text('started_on').notNull(),
  /** ISO `YYYY-MM-DD` these terms took effect. */
  termsEffectiveFrom: text('terms_effective_from').notNull(),
  source: text('source', { enum: LOAN_TERMS_SOURCES }).notNull().default('manual'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

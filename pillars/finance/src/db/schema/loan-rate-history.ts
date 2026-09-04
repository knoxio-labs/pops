import { sql } from 'drizzle-orm';
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { LOAN_RATE_SOURCES } from '../../contract/loan.js';
import { accounts } from './accounts.js';

/**
 * Every rate a `loan`-kind account has carried (POPS-2829). The current rate
 * is the row with the greatest `effective_from`, and is mirrored onto
 * `loan_terms.annual_rate_pct` in the same transaction that writes it here.
 *
 * `loan_account_id` foreign-keys `accounts.id` rather than
 * `loan_terms.account_id`, so the FK stays a plain reference to the account
 * even though the service layer requires terms to exist before a rate can be
 * recorded (there is nothing to keep in step otherwise).
 */
export const loanRateHistory = sqliteTable(
  'loan_rate_history',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    loanAccountId: text('loan_account_id')
      .notNull()
      .references(() => accounts.id),
    /** Annual rate as a percentage — `5.49` means 5.49% p.a. */
    annualRatePct: real('annual_rate_pct').notNull(),
    /** ISO `YYYY-MM-DD` this rate took effect. */
    effectiveFrom: text('effective_from').notNull(),
    source: text('source', { enum: LOAN_RATE_SOURCES }).notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('idx_loan_rate_history_account_effective').on(table.loanAccountId, table.effectiveFrom),
  ]
);

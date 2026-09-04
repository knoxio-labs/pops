import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts.js';

/**
 * Which accounts offset a `loan`-kind account, and when (POPS-2829).
 *
 * A link table rather than a column on `loan_terms` for two reasons: a
 * mortgage package can carry several offset accounts at once, and the link
 * is temporal — unlinking sets `unlinked_at` instead of deleting the row, so
 * a past offset arrangement stays readable.
 *
 * `offset_account_id` is not restricted to a kind. Nothing in the ledger
 * depends on what the offsetting account is, and the investigation this
 * ticket follows deliberately left that side open.
 */
export const loanOffsetLinks = sqliteTable(
  'loan_offset_links',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    loanAccountId: text('loan_account_id')
      .notNull()
      .references(() => accounts.id),
    offsetAccountId: text('offset_account_id')
      .notNull()
      .references(() => accounts.id),
    /** ISO `YYYY-MM-DD` the offset arrangement started. */
    linkedFrom: text('linked_from').notNull(),
    /** ISO timestamp the link was closed, or null while it is active. */
    unlinkedAt: text('unlinked_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('idx_loan_offset_links_loan').on(table.loanAccountId),
    // Partial: at most one ACTIVE link per pair, while closed links stay on
    // the table so re-linking a previously unlinked account still works.
    uniqueIndex('idx_loan_offset_links_active_pair')
      .on(table.loanAccountId, table.offsetAccountId)
      .where(sql`${table.unlinkedAt} IS NULL`),
  ]
);

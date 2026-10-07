import { sql } from 'drizzle-orm';
import { check, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts.js';

/** What a grant lets its holder do on the account, weakest first. */
export const ACCOUNT_GRANT_ROLES = ['view', 'edit'] as const;
export type AccountGrantRole = (typeof ACCOUNT_GRANT_ROLES)[number];

/**
 * One email's access to one account (POPS-5827).
 *
 * A guest sees an account only through a row here; there is no implicit grant
 * and no migration ever writes one. Rows are keyed by the exact email the
 * identity provider asserts, with no alias or dot folding.
 */
export const accountGrants = sqliteTable(
  'account_grants',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /**
     * Stored lower-cased; a CHECK refuses anything else, so the unique index
     * below cannot hold two spellings of one address. Callers normalise
     * before writing and before looking a grant up.
     */
    email: text('email').notNull(),
    /**
     * FK → `accounts.id`, `ON DELETE CASCADE`. Merging accounts deletes the
     * source row and its grants go with it on purpose: access to the
     * surviving account needs a grant of its own.
     */
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ACCOUNT_GRANT_ROLES }).notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    /** Email of whoever granted it. Null when that caller carried no identity. */
    createdBy: text('created_by'),
  },
  (table) => [
    uniqueIndex('idx_account_grants_email_account').on(table.email, table.accountId),
    check('account_grants_role_check', sql`${table.role} IN ('view', 'edit')`),
    check('account_grants_email_lowercase_check', sql`${table.email} = lower(${table.email})`),
  ]
);

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { ACCOUNT_KINDS } from '../../contract/account-kind.js';

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    /** Nullable — `cash` and `person` accounts have no issuing institution. */
    institutionId: text('institution_id'),
    kind: text('kind', { enum: ACCOUNT_KINDS }).notNull(),
    /** `currencies.code` this account is denominated in. */
    currency: text('currency').notNull(),
    /** Nullable — set once the account is closed/hidden from active views. */
    archivedAt: text('archived_at'),
    displayOrder: integer('display_order').notNull().default(0),
    /** Nullable — the contacts entity this `person` account is owed by/owes. */
    entityId: text('entity_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    // Case-insensitive uniqueness — migration hand-edited for `COLLATE
    // NOCASE`, same as `institutions.name`.
    index('idx_accounts_name_nocase').on(table.name),
    // The migration hand-adds `WHERE kind = 'cash'` — drizzle-kit can't
    // express a partial index, so this declaration exists for drizzle's
    // schema introspection only; the actual DDL lives in
    // `migrations/0083_accounts.sql`.
    index('idx_accounts_kind_currency_cash').on(table.kind, table.currency),
    // One `person` account per contact per currency (POPS-2771). A plain
    // (not partial) UNIQUE index: SQLite treats every NULL `entity_id` as
    // distinct from every other for uniqueness purposes, so the many
    // non-`person` accounts (which always carry `entity_id = null`) never
    // collide with each other here, and neither do two `person` accounts
    // both transiently pending outbox resolution — see
    // `migrations/0085_person_account_entity_currency.sql`.
    index('idx_accounts_entity_currency').on(table.entityId, table.currency),
  ]
);

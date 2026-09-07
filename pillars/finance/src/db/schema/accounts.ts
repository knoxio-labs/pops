import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    /**
     * Nullable — the contacts Entity this account is linked to: the contact a
     * `person` account is owed by/owes, or (POPS-3063) the `bank`-typed
     * Entity an issuer-bearing account's institution was migrated to. Null
     * for `cash`, for a `person` account still pending outbox resolution,
     * and for an issuer-bearing account whose institution has not migrated
     * yet — the latter falls back to `institutionId` at read time.
     */
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
    // One `person` account per contact per currency (POPS-2771). Scoped to
    // `kind = 'person'` (POPS-3063) — `entity_id` now also carries a
    // `bank`-typed issuer for ordinary accounts, and two ordinary accounts
    // sharing the same issuer and currency (an AUD checking and an AUD
    // savings account both at the same bank) is completely normal, not a
    // conflict. SQLite treats every NULL `entity_id` as distinct from every
    // other for uniqueness purposes regardless of the WHERE clause, so a
    // `cash`/unlinked account's permanent `entity_id = null` and a `person`
    // account transiently pending outbox resolution both still never
    // collide here — see `migrations/0085_person_account_entity_currency.sql`
    // and `migrations/0099_accounts_entity_id_backfill.sql`.
    uniqueIndex('idx_accounts_entity_currency')
      .on(table.entityId, table.currency)
      .where(sql`${table.kind} = 'person'`),
  ]
);

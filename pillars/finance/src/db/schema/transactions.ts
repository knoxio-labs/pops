import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { TRANSACTION_TYPES } from '../../contract/corrections-constants.js';
import { FX_CAPTURE_SOURCES } from '../../contract/fx-capture.js';
import { TRANSACTION_MATCH_TYPES } from '../match-types.js';

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    notionId: text('notion_id').unique(),
    description: text('description').notNull(),
    /** FK to `accounts.id` — the sole account identity for a transaction. */
    accountId: text('account_id').notNull(),
    /** Signed amount in integer cents (#3665, CF041) — never a float dollar value. */
    amountCents: integer('amount_cents').notNull(),
    date: text('date').notNull(),
    type: text('type', { enum: TRANSACTION_TYPES }).notNull(),
    tags: text('tags').notNull().default('[]'),
    entityId: text('entity_id'),
    entityName: text('entity_name'),
    location: text('location'),
    country: text('country'),
    relatedTransactionId: text('related_transaction_id'),
    /** User-authored only. Importers write their derived detail to typed columns. */
    notes: text('notes'),
    /**
     * Amount charged abroad, in the currency's own ISO-4217 minor units — `1100`
     * is ¥1,100 for JPY (no minor unit) and $11.00 for USD, so it is meaningless
     * without `foreignCurrency`.
     */
    foreignAmountMinor: integer('foreign_amount_minor'),
    /** ISO-4217 alpha-3 of the charge abroad. Null for a domestic charge. */
    foreignCurrency: text('foreign_currency'),
    /**
     * The issuer's foreign-transaction FEE in AUD cents (~3% of the charge) —
     * not the converted AUD total, which the statement never states separately.
     */
    fxFeeCents: integer('fx_fee_cents'),
    /**
     * Which foreign-charge capture path ran on this row (POPS-2647), so the
     * three columns above and `country` can be read as "captured, and there was
     * nothing to find" rather than "nobody looked". See
     * `src/contract/fx-capture.ts` for what each value promises.
     *
     * NULL means nobody declared anything — not "domestic". A row imported
     * before this column existed whose `raw_row` no parser recognises keeps it,
     * because the short Amex export and a plain bank CSV are indistinguishable
     * once stored. It is deliberately not a member of the union: `unavailable`
     * is a statement, and only an importer that ran may make it.
     */
    fxCaptureSource: text('fx_capture_source', { enum: FX_CAPTURE_SOURCES }),
    checksum: text('checksum'),
    rawRow: text('raw_row'),
    lastEditedTime: text('last_edited_time').notNull(),
    /**
     * How the entity assignment was produced at commit time (CF057/#3658):
     * one of the entity-matcher's stages (`alias`/`exact`/`prefix`/`contains`),
     * `ai`, `learned` (a correction rule), `manual` (user override), or `none`
     * (no entity — e.g. a transfer). Nullable — rows committed before this
     * column existed carry no provenance.
     */
    matchType: text('match_type', { enum: TRANSACTION_MATCH_TYPES }),
    /** Winning correction rule id, set only when `matchType` is `learned`. */
    matchRuleId: text('match_rule_id'),
    /** Match confidence (0-1), set only for `ai`/`learned` matches. */
    matchConfidence: real('match_confidence'),
  },
  (table) => [
    index('idx_transactions_date').on(table.date),
    index('idx_transactions_account_id').on(table.accountId),
    index('idx_transactions_entity').on(table.entityId),
    index('idx_transactions_last_edited').on(table.lastEditedTime),
    index('idx_transactions_notion_id').on(table.notionId),
    index('idx_transactions_checksum').on(table.checksum),
  ]
);

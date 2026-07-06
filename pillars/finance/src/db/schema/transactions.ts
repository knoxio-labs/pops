import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { TRANSACTION_TYPES } from '../../contract/corrections-constants.js';
import { TRANSACTION_MATCH_TYPES } from '../match-types.js';

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    notionId: text('notion_id').unique(),
    description: text('description').notNull(),
    account: text('account').notNull(),
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
    notes: text('notes'),
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
    index('idx_transactions_account').on(table.account),
    index('idx_transactions_entity').on(table.entityId),
    index('idx_transactions_last_edited').on(table.lastEditedTime),
    index('idx_transactions_notion_id').on(table.notionId),
    index('idx_transactions_checksum').on(table.checksum),
  ]
);

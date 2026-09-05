import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { TRANSACTION_TYPES } from '../../contract/corrections-constants.js';
import { MIN_MATCH_CONFIDENCE } from '../../contract/corrections-pure.js';
import { accounts } from './accounts.js';

export const transactionCorrections = sqliteTable(
  'transaction_corrections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    descriptionPattern: text('description_pattern').notNull(),
    /**
     * Optional scope — `null` (the default, and what every pre-POPS-2593 row
     * migrated to) means the rule matches transactions on every account.
     *
     * Set only by an operator narrowing a rule to one account, so two banks
     * posting an identical description can each carry their own rule. No
     * proposal surface ever populates it: a narrower rule is worse by
     * default, and nothing should nudge toward one.
     *
     * `no action` on delete rather than `set null`: silently widening a
     * deliberately-narrowed rule to every account is exactly the
     * misattribution this column exists to prevent. `mergeAccounts` repoints
     * these rows explicitly, the way it repoints every other `account_id`.
     */
    accountId: text('account_id').references(() => accounts.id),
    matchType: text('match_type', { enum: ['exact', 'contains', 'regex'] })
      .notNull()
      .default('exact'),
    entityId: text('entity_id'),
    entityName: text('entity_name'),
    location: text('location'),
    tags: text('tags').notNull().default('[]'),
    transactionType: text('transaction_type', { enum: TRANSACTION_TYPES }),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    confidence: real('confidence').notNull().default(MIN_MATCH_CONFIDENCE),
    priority: integer('priority').notNull().default(0),
    timesApplied: integer('times_applied').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    lastUsedAt: text('last_used_at'),
  },
  (table) => [
    index('idx_corrections_pattern').on(table.descriptionPattern),
    index('idx_corrections_account').on(table.accountId),
    index('idx_corrections_priority').on(table.priority),
    index('idx_corrections_confidence').on(table.confidence),
    index('idx_corrections_times_applied').on(table.timesApplied),
  ]
);

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { ENTITY_TYPES } from '../entity-types.js';

export const entityPrecreateOutbox = sqliteTable(
  'entity_precreate_outbox',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    type: text('type', { enum: ENTITY_TYPES }).notNull(),
    status: text('status', { enum: ['pending', 'resolved', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    /**
     * True when the row dead-lettered on a failure retrying can never fix (a
     * `ContactsPermanentError` — 400, contract mismatch, refusal), as opposed
     * to running out of attempts against an outage. The boot requeue skips
     * these: a restart is not the fix for a request contacts will always
     * reject (POPS-2690).
     */
    permanentFailure: integer('permanent_failure', { mode: 'boolean' }).notNull().default(false),
    lastAttemptAt: text('last_attempt_at'),
    lastError: text('last_error'),
    resolvedEntityId: text('resolved_entity_id'),
    /**
     * Set only when this row resolves a pending `person` account's
     * `entity_id` (POPS-2771), rather than a `pending:contact:{uuid}`
     * placeholder swept out of `transactions` / `transaction_corrections` /
     * `transaction_tag_rules`. A `person` account keeps `entity_id` genuinely
     * NULL while pending (see `db/schema/accounts.ts`'s uniqueness note), so
     * there is no placeholder value to search for — the reconciler needs this
     * id to know which account row to fill in.
     */
    accountId: text('account_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    resolvedAt: text('resolved_at'),
  },
  (table) => [index('idx_entity_precreate_outbox_status').on(table.status)]
);

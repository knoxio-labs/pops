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
    lastAttemptAt: text('last_attempt_at'),
    lastError: text('last_error'),
    resolvedEntityId: text('resolved_entity_id'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    resolvedAt: text('resolved_at'),
  },
  (table) => [index('idx_entity_precreate_outbox_status').on(table.status)]
);

import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { journeys, journeyLegs } from './journeys.js';

/** Narrow server-owned removal receipts retain identity, exact order and immutable retry preconditions. */
export const legRemovals = sqliteTable(
  'journey_leg_removals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    journeyId: integer('journey_id')
      .notNull()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    legId: integer('leg_id')
      .notNull()
      .references(() => journeyLegs.id, { onDelete: 'cascade' }),
    operationId: text('operation_id').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    removedRevision: integer('removed_revision').notNull(),
    ordinal: integer('ordinal').notNull(),
    remainingLegIds: text('remaining_leg_ids', { mode: 'json' }).$type<number[]>().notNull(),
    removedAt: text('removed_at').notNull(),
    restoredExpectedRevision: integer('restored_expected_revision'),
    restoredRevision: integer('restored_revision'),
    restoredAt: text('restored_at'),
  },
  (table) => [uniqueIndex('idx_leg_removal_operation').on(table.journeyId, table.operationId)]
);

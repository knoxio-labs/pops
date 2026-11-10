import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { RESPONSIBILITY_TARGET_KINDS } from '../../contract/responsibilities.js';
import { trips } from './records.js';

import type { Responsibility } from '../../contract/responsibilities.js';

/** One revisioned assignment per target; a cleared row prevents stale recreation. */
export const arrangementResponsibilities = sqliteTable(
  'arrangement_responsibilities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    targetKind: text('target_kind', { enum: RESPONSIBILITY_TARGET_KINDS }).notNull(),
    targetId: integer('target_id').notNull(),
    responsibility: text('responsibility', { mode: 'json' }).$type<Responsibility>(),
    revision: integer('revision').notNull(),
  },
  (table) => [
    uniqueIndex('uq_arrangement_responsibility_target').on(
      table.tripId,
      table.targetKind,
      table.targetId
    ),
  ]
);

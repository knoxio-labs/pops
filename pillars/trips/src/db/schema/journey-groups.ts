import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { journeys } from './journeys.js';
import { trips } from './records.js';

/** Explicit selected source identity and optimistic grouping revision, independent of source facts. */
export const journeyGroups = sqliteTable(
  'journey_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    currentJourneyId: integer('current_journey_id')
      .notNull()
      .references(() => journeys.id),
    revision: integer('revision').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('idx_journey_groups_trip').on(table.tripId)]
);

/** Source membership can be shared across groups; each group independently orders its alternatives. */
export const journeyGroupMembers = sqliteTable(
  'journey_group_members',
  {
    groupId: integer('group_id')
      .notNull()
      .references(() => journeyGroups.id),
    journeyId: integer('journey_id')
      .notNull()
      .references(() => journeys.id),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.journeyId] }),
    index('idx_journey_group_members_journey').on(table.journeyId),
  ]
);

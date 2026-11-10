import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import type { SourceLink, VisitTiming } from '../../contract/schemas.js';

const audit = {
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
};

/** Trip metadata owned exclusively by this pillar. */
export const trips = sqliteTable('trips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  destination: text('destination').notNull().default(''),
  when: text('when_text').notNull().default(''),
  tagId: text('tag_id'),
  parentId: integer('parent_id').references((): AnySQLiteColumn => trips.id),
  notes: text('notes').notNull().default(''),
  sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
  ...audit,
});

/** Reusable manually entered place identities, independent of visits. */
export const places = sqliteTable('places', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
  ...audit,
});

/** Visit occurrences; changing position never changes the source timing. */
export const visits = sqliteTable(
  'visits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    placeId: integer('place_id')
      .notNull()
      .references(() => places.id),
    position: integer('position').notNull(),
    revision: integer('revision').notNull().default(0),
    timing: text('timing', { mode: 'json' }).$type<VisitTiming>().notNull().default({}),
    notes: text('notes').notNull().default(''),
    sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
    ...audit,
  },
  (table) => [index('idx_visits_trip_position').on(table.tripId, table.position)]
);

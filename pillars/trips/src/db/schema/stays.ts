import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { trips, visits } from './records.js';

import type { SourceLink } from '../../contract/schemas.js';
import type { Stay, StayTiming } from '../../contract/stay-schemas.js';

/** Trip-owned stay facts; timing is separate from the optional visit association. */
export const stays = sqliteTable(
  'stays',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    visitId: integer('visit_id').references(() => visits.id),
    name: text('name'),
    kind: text('kind').$type<Stay['kind']>(),
    status: text('status').$type<Stay['status']>(),
    timing: text('timing', { mode: 'json' }).$type<StayTiming>().notNull().default({}),
    address: text('address'),
    reference: text('reference'),
    notes: text('notes').notNull().default(''),
    sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
    hostLinks: text('host_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
    documentLinks: text('document_links', { mode: 'json' })
      .$type<SourceLink[]>()
      .notNull()
      .default([]),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('idx_stays_trip').on(table.tripId)]
);

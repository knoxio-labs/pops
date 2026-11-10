import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { trips, visits } from './records.js';

import type { EventTiming, TripEvent } from '../../contract/event-schemas.js';
import type { SourceLink } from '../../contract/schemas.js';

/** Event facts belong to a trip; opaque external links never transfer ownership. */
export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    visitId: integer('visit_id').references(() => visits.id),
    name: text('name'),
    intention: text('intention').$type<TripEvent['intention']>(),
    arrangement: text('arrangement').$type<TripEvent['arrangement']>(),
    purchase: text('purchase').$type<TripEvent['purchase']>(),
    timing: text('timing', { mode: 'json' }).$type<EventTiming>().notNull().default({}),
    address: text('address'),
    reference: text('reference'),
    sourceUrl: text('source_url'),
    ticketUrl: text('ticket_url'),
    notes: text('notes').notNull().default(''),
    sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
    venueLinks: text('venue_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
    organiserLinks: text('organiser_links', { mode: 'json' })
      .$type<SourceLink[]>()
      .notNull()
      .default([]),
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
  (table) => [index('idx_events_trip').on(table.tripId)]
);

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { trips } from './records.js';

import type {
  JourneyBuffers,
  JourneyEndpoint,
  JourneyLeg,
} from '../../contract/journey-schemas.js';
import type { SourceLink } from '../../contract/schemas.js';

const audit = {
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
};

/** Journey source metadata, owned by a trip without changing its visits. */
export const journeys = sqliteTable(
  'journeys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    legRevision: integer('leg_revision').notNull().default(0),
    name: text('name'),
    reference: text('reference'),
    notes: text('notes').notNull().default(''),
    sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
    buffers: text('buffers', { mode: 'json' }).$type<JourneyBuffers>().notNull().default({}),
    ...audit,
  },
  (table) => [index('idx_journeys_trip').on(table.tripId)]
);

/** Ordered independent leg facts; endpoint JSON retains partial source values. */
export const journeyLegs = sqliteTable(
  'journey_legs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    journeyId: integer('journey_id')
      .notNull()
      .references(() => journeys.id),
    position: integer('position').notNull(),
    removedAt: text('removed_at'),
    removalOperationId: text('removal_operation_id'),
    mode: text('mode'),
    from: text('from_endpoint', { mode: 'json' }).$type<JourneyEndpoint>().notNull().default({}),
    to: text('to_endpoint', { mode: 'json' }).$type<JourneyEndpoint>().notNull().default({}),
    intention: text('intention').$type<JourneyLeg['intention']>(),
    arrangement: text('arrangement').$type<JourneyLeg['arrangement']>(),
    purchase: text('purchase').$type<JourneyLeg['purchase']>(),
    operator: text('operator'),
    service: text('service'),
    reference: text('reference'),
    notes: text('notes').notNull().default(''),
    sourceLinks: text('source_links', { mode: 'json' }).$type<SourceLink[]>().notNull().default([]),
    ...audit,
  },
  (table) => [index('idx_journey_legs_position').on(table.journeyId, table.position)]
);

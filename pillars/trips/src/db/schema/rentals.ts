import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { trips } from './records.js';

import type { Rental } from '../../contract/rental-schemas.js';

/** Trip-owned rental source facts; Visit order never supplies rental dates. */
export const rentals = sqliteTable(
  'rentals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    provider: text('provider'),
    pickupVisitId: integer('pickup_visit_id'),
    returnVisitId: integer('return_visit_id'),
    start: text('start'),
    end: text('end'),
    status: text('status').$type<Rental['status']>(),
    revision: integer('revision').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('idx_rentals_trip').on(table.tripId)]
);

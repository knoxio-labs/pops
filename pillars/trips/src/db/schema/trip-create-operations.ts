import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { trips } from './records.js';

import type {
  TripCreateOperation,
  TripCreateReceipt,
} from '../../contract/trip-create-operations.js';

/** Durable acknowledgements for explicit trip-creation operations. */
export const tripCreateOperations = sqliteTable(
  'trip_create_operations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    operationId: text('operation_id').notNull(),
    request: text('request', { mode: 'json' }).$type<TripCreateOperation>().notNull(),
    canonicalRequest: text('canonical_request').notNull(),
    receipt: text('receipt', { mode: 'json' }).$type<TripCreateReceipt>().notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [uniqueIndex('idx_trip_create_operations_uuid').on(table.operationId)]
);

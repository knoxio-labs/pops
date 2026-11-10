import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { trips } from './records.js';

import type { RouteOperation, RouteReceipt, TripRoute } from '../../contract/route-schemas.js';

/** Single aggregate owns root and alternative order; JSON preserves typed, heterogeneous membership. */
export const tripRoutes = sqliteTable('trip_routes', {
  tripId: integer('trip_id')
    .primaryKey()
    .references(() => trips.id),
  revision: integer('revision').notNull().default(0),
  content: text('content', { mode: 'json' }).$type<Pick<TripRoute, 'order' | 'paths'>>().notNull(),
});
/** Stable structural identities survive Undo; retained allocation prevents reusing an issued gap ID. */
export const routeGaps = sqliteTable('route_gaps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tripId: integer('trip_id')
    .notNull()
    .references(() => trips.id),
});
/** Path identity allocation is independent of membership so Undo restores the original identity. */
export const routePaths = sqliteTable('route_paths', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tripId: integer('trip_id')
    .notNull()
    .references(() => trips.id),
});
/** Immutable UUID outcomes and separate own-Undo guards; no source rows are cloned or rewritten. */
export const routeOperations = sqliteTable(
  'route_operations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    operationId: text('operation_id').notNull(),
    request: text('request', { mode: 'json' }).$type<RouteOperation>().notNull(),
    receipt: text('receipt', { mode: 'json' }).$type<RouteReceipt>().notNull(),
    expectedAfter: text('expected_after', { mode: 'json' }).$type<TripRoute>().notNull(),
    undoneBy: text('undone_by'),
  },
  (table) => [uniqueIndex('idx_route_operations_identity').on(table.tripId, table.operationId)]
);

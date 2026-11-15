import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { trips } from './records.js';

import type { RouteDraftOperation, RouteDraftReceipt } from '../../contract/route-draft-schemas.js';
import type { RouteOperation, RouteReceipt, TripRoute } from '../../contract/route-schemas.js';
import type { RouteDraftInverse } from '../services/route-draft-effects.js';

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
/** Shared UUID outcomes preserve capability families and independent route/source own-Undo guards. */
export const routeOperations = sqliteTable(
  'route_operations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
    operationId: text('operation_id').notNull(),
    family: text('family', { enum: ['placement', 'draft'] })
      .notNull()
      .default('placement'),
    request: text('request', { mode: 'json' })
      .$type<RouteOperation | RouteDraftOperation>()
      .notNull(),
    receipt: text('receipt', { mode: 'json' }).$type<RouteReceipt | RouteDraftReceipt>().notNull(),
    sourceInverse: text('source_inverse', { mode: 'json' }).$type<RouteDraftInverse>(),
    expectedAfter: text('expected_after', { mode: 'json' }).$type<TripRoute>().notNull(),
    undoneBy: text('undone_by'),
  },
  (table) => [uniqueIndex('idx_route_operations_identity').on(table.tripId, table.operationId)]
);

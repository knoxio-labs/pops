import { integer, text } from 'drizzle-orm/sqlite-core';

import { places, trips, visits } from './records.js';

import type { HasDefault, HasRuntimeDefault, IsPrimaryKey, NotNull } from 'drizzle-orm';
import type {
  SQLiteIntegerBuilderInitial,
  SQLiteTextBuilderInitial,
} from 'drizzle-orm/sqlite-core';

type TextColumn<Name extends string> = SQLiteTextBuilderInitial<
  Name,
  [string, ...string[]],
  number | undefined
>;
type Timestamp<Name extends string> = HasRuntimeDefault<HasDefault<NotNull<TextColumn<Name>>>>;

/** Fresh revision and audit builders for each independently versioned source table. */
export function sourceAuditColumns(): {
  revision: HasDefault<NotNull<SQLiteIntegerBuilderInitial<'revision'>>>;
  removedAt: TextColumn<'removed_at'>;
  createdAt: Timestamp<'created_at'>;
  updatedAt: Timestamp<'updated_at'>;
} {
  return {
    revision: integer('revision').notNull().default(1),
    removedAt: text('removed_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  };
}
/** Fresh owning trip and generated identity builders for each source table. */
export function sourceOwnershipColumns(): {
  id: IsPrimaryKey<HasDefault<NotNull<SQLiteIntegerBuilderInitial<'id'>>>>;
  tripId: NotNull<SQLiteIntegerBuilderInitial<'trip_id'>>;
} {
  return {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: integer('trip_id')
      .notNull()
      .references(() => trips.id),
  };
}
/** Nullable explicit place and visit identities; no name matching or route insertion is performed. */
export function sourceLocationColumns(): {
  placeId: SQLiteIntegerBuilderInitial<'place_id'>;
  visitId: SQLiteIntegerBuilderInitial<'visit_id'>;
} {
  return {
    placeId: integer('place_id').references(() => places.id),
    visitId: integer('visit_id').references(() => visits.id),
  };
}

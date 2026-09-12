import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { locations } from './locations.js';

/**
 * A box's lifecycle: `open` while being filled, `sealed` once closed,
 * `moved` once relocated to its destination, `unpacked` once opened again.
 * Enforced in SQL by `ck_containers_state` (see the owning migration) —
 * this array is the TypeScript half of that constraint and the two must
 * stay in sync by hand, since nothing generates one from the other.
 */
export const CONTAINER_STATES = ['open', 'sealed', 'moved', 'unpacked'] as const;

export const containers = sqliteTable(
  'containers',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    label: text('label').notNull(),
    code: text('code'),
    state: text('state').notNull().default('open'),
    originLocationId: text('origin_location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    destinationLocationId: text('destination_location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('idx_containers_code').on(table.code),
    index('idx_containers_origin').on(table.originLocationId),
    index('idx_containers_destination').on(table.destinationLocationId),
    index('idx_containers_state').on(table.state),
  ]
);

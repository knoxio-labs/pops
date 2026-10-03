import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Shared tag vocabulary entries owned by this pillar. */
export const tags = sqliteTable(
  'tags',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    facet: text('facet').notNull(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    description: text('description'),
    windowStart: text('window_start'),
    windowEnd: text('window_end'),
    windowRegion: text('window_region'),
    archivedAt: text('archived_at'),
    mergedIntoId: text('merged_into_id'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex('uq_tags_active_facet_name')
      .on(table.facet, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} IS NULL`),
    index('idx_tags_parent_id').on(table.parentId),
    index('idx_tags_merged_into_id').on(table.mergedIntoId),
    check(
      'ck_tags_window_bounds',
      sql`${table.windowEnd} IS NULL OR ${table.windowStart} IS NULL OR ${table.windowEnd} >= ${table.windowStart}`
    ),
    check(
      'ck_tags_window_region_requires_start',
      sql`${table.windowRegion} IS NULL OR ${table.windowStart} IS NOT NULL`
    ),
    check(
      'ck_tags_merged_requires_archived',
      sql`${table.mergedIntoId} IS NULL OR ${table.archivedAt} IS NOT NULL`
    ),
  ]
);

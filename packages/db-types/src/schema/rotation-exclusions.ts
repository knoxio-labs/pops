import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const rotationExclusions = sqliteTable(
  'rotation_exclusions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tmdbId: integer('tmdb_id').notNull(),
    title: text('title').notNull(),
    reason: text('reason'),
    excludedAt: text('excluded_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex('idx_rotation_exclusions_tmdb_id').on(table.tmdbId)]
);

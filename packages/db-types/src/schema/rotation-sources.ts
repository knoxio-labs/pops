import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const rotationSources = sqliteTable(
  'rotation_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type').notNull(), // 'plex_watchlist' | 'plex_friends' | 'imdb_top_100' | 'manual' | 'letterboxd'
    name: text('name').notNull(),
    priority: integer('priority').notNull().default(5), // 1-10
    enabled: integer('enabled').notNull().default(1), // boolean
    config: text('config'), // JSON text
    lastSyncedAt: text('last_synced_at'),
    syncIntervalHours: integer('sync_interval_hours').notNull().default(24),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [index('idx_rotation_sources_type').on(table.type)]
);

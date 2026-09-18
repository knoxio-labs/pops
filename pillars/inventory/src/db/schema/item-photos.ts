import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { items } from './items.js';
import { media } from './media.js';

/**
 * An item's photos, in `position` order. A photo is either content-addressed
 * (`media_sha256`) or a legacy file on the images volume (`file_path`), and at
 * least one of the two is always set; the boot backfill adds the hash to
 * legacy rows whose file it can read.
 */
export const itemPhotos = sqliteTable(
  'item_photos',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    mediaSha256: text('media_sha256').references(() => media.sha256),
    filePath: text('file_path'),
    caption: text('caption'),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_item_photos_item').on(table.itemId),
    check(
      'ck_item_photos_source',
      sql`${table.mediaSha256} IS NOT NULL OR ${table.filePath} IS NOT NULL`
    ),
  ]
);

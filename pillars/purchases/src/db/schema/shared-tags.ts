/**
 * The Purchases-owned cache of the shared vocabulary and its line-item
 * assignments. Tag ids belong to the tags pillar; only the item reference is
 * local and cascades with its row.
 */
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { purchaseItems } from './items.js';

export const purchaseItemSharedTags = sqliteTable(
  'purchase_item_shared_tags',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => purchaseItems.id, { onDelete: 'cascade' }),
    tagId: text('tag_id').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    confirmedAt: text('confirmed_at'),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.tagId] }),
    index('idx_purchase_item_shared_tags_tag').on(t.tagId),
  ]
);

export const sharedTagCache = sqliteTable('shared_tag_cache', {
  tagId: text('tag_id').primaryKey(),
  facet: text('facet').notNull(),
  name: text('name').notNull(),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  mergedIntoId: text('merged_into_id'),
  fetchedAt: text('fetched_at').notNull(),
});

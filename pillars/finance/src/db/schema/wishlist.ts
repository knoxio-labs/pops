import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const wishList = sqliteTable('wish_list', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  notionId: text('notion_id').unique(),
  item: text('item').notNull(),
  /** Target price in integer cents, or null (#3665, CF041). */
  targetAmountCents: integer('target_amount_cents'),
  /** Amount saved so far in integer cents, or null (#3665, CF041). */
  savedCents: integer('saved_cents'),
  priority: text('priority'),
  url: text('url'),
  notes: text('notes'),
  lastEditedTime: text('last_edited_time').notNull(),
});

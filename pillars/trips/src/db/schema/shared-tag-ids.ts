import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Cached identities from the Tags-owned vocabulary; no names, windows or assignments are owned here. */
export const sharedTagIds = sqliteTable('shared_tag_ids', {
  id: text('id').primaryKey(),
  fetchedAt: text('fetched_at').notNull(),
});

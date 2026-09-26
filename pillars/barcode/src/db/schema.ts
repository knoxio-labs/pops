import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Persistent cache rows for normalised barcode lookups. */
export const lookupCache = sqliteTable('lookup_cache', {
  code: text('code').primaryKey(),
  outcome: text('outcome', { enum: ['found', 'not_found'] as const }).notNull(),
  productJson: text('product_json'),
  source: text('source'),
  fetchedAt: text('fetched_at').notNull(),
  expiresAt: text('expires_at').notNull(),
});

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Keys `sync_meta` holds (Inventory ADR-002 D10): `epoch`, a random id seeded
 * by migration `0012_items_single_identity` and rotated by the restore
 * runbook; `min_protocol`, the lowest `Pops-Inventory-Protocol` served, seeded
 * as `1`; `catalogue_revision`, the current immutable published catalogue; and
 * `connections_changed_at`, the latest connection or fixture write time for
 * web stale banners.
 */
export const SYNC_META_KEYS = [
  'epoch',
  'min_protocol',
  'catalogue_revision',
  'connections_changed_at',
] as const;
/** One of {@link SYNC_META_KEYS}. */
export type SyncMetaKey = (typeof SYNC_META_KEYS)[number];

/** Key/value settings of the sync protocol; see {@link SYNC_META_KEYS}. */
export const syncMeta = sqliteTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

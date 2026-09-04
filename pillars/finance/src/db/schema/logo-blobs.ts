import { sql } from 'drizzle-orm';
import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Raw bytes for an uploaded logo. Storage decision + rationale: ADR-050
 * (`docs/architecture/adr-050-finance-logo-storage.md`). In short — this
 * table lives in the same `finance.db` file as every other finance table
 * specifically so litestream's existing whole-file replication covers it for
 * free; a filesystem path would need its own backup mechanism this repo has
 * no generic answer for.
 *
 * A row is never updated in place — uploading a replacement always inserts a
 * NEW row and the referencing column (`institutions.logo_asset_id`) is
 * repointed to it. That makes an asset's URL cacheable forever
 * (`Cache-Control: immutable`): the bytes behind a given id never change.
 */
export const logoBlobs = sqliteTable('logo_blobs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contentType: text('content_type').notNull(),
  byteLength: integer('byte_length').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

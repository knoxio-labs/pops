import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Content-addressed image bytes (Inventory ADR-002 D9). `sha256` is the
 * lowercase hex SHA-256 of the stored bytes, which live on the images volume
 * at `sha256[0:2]/sha256`; the CHECK refuses anything that is not 64 lowercase
 * hex characters. Rows are only ever added: storing the same bytes again is a
 * no-op.
 */
export const media = sqliteTable(
  'media',
  {
    sha256: text('sha256').primaryKey(),
    mime: text('mime').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    storedAt: text('stored_at').notNull(),
  },
  (table) => [
    check(
      'ck_media_sha256',
      sql`length(${table.sha256}) = 64 AND ${table.sha256} NOT GLOB '*[^0-9a-f]*'`
    ),
    check('ck_media_byte_size', sql`${table.byteSize} >= 0`),
  ]
);

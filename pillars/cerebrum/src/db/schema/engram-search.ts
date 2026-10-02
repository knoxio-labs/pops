/**
 * Lexical search store for engrams.
 *
 * `engram_search_docs` holds one row per engram with the title and body read
 * from its Markdown file. It is the external-content table behind the
 * `engram_fts` FTS5 index, which triggers in `0058_engram_search.sql` keep in
 * step with every insert, update and delete here. `engram_fts` has no drizzle
 * table object because virtual tables cannot be represented in the schema
 * builder.
 *
 * `engram_id` deliberately has no foreign key: several index writers replace an
 * `engram_index` row by deleting and re-inserting it, and a cascade would drop
 * the search row each time.
 */
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const engramSearchDocs = sqliteTable(
  'engram_search_docs',
  {
    docid: integer('docid').primaryKey(),
    engramId: text('engram_id').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    bodyHash: text('body_hash').notNull(),
  },
  (table) => [uniqueIndex('uq_engram_search_docs_engram_id').on(table.engramId)]
);

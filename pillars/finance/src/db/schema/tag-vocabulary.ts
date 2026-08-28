import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { TagFacetKind } from '../tag-facets.js';

export const tagVocabulary = sqliteTable(
  'tag_vocabulary',
  {
    tag: text('tag').primaryKey(),
    /** The `facet:value` prefix, or null for an unprefixed legacy tag. */
    facet: text('facet'),
    /** Who may mint a value on this facet — see `src/db/tag-facets.ts`. */
    kind: text('kind', { enum: ['closed', 'open', 'marker'] })
      .notNull()
      .default('open')
      .$type<TagFacetKind>(),
    source: text('source', { enum: ['seed', 'user'] })
      .notNull()
      .default('seed'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    /** Times this tag has been written onto a transaction; ranks the vocabulary. */
    usageCount: integer('usage_count').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_tag_vocabulary_active').on(table.isActive),
    index('idx_tag_vocabulary_kind').on(table.kind, table.usageCount),
  ]
);

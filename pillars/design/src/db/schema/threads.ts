import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * A comment thread pinned to one element of one playground address.
 *
 * `route` is the canonical address the comment was left on (see
 * `src/shell/address.ts`), so a thread found later can be reopened exactly
 * where it was written. `anchorKind` plus `anchor` are how it finds its
 * element again: the anchor is the JSON payload of the discriminated union in
 * `src/comments/anchors.ts`, stored as text because its shape differs per
 * kind and SQLite has nothing better to offer than a string either way.
 */
export const designThreads = sqliteTable(
  'design_threads',
  {
    id: text('id').primaryKey(),
    route: text('route').notNull(),
    themeKey: text('theme_key').notNull().default(''),
    viewport: text('viewport').notNull().default(''),
    anchorKind: text('anchor_kind').notNull(),
    anchor: text('anchor').notNull(),
    status: text('status').notNull().default('open'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    resolvedBy: text('resolved_by'),
    resolvedAt: text('resolved_at'),
  },
  (table) => [
    index('idx_design_threads_status').on(table.status),
    index('idx_design_threads_created_at').on(table.createdAt),
  ]
);

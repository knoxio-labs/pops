import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { items } from './items.js';

/**
 * Reverse index of cross-item computed dependencies (Inventory ADR-002 D5):
 * one row per item whose computed values read another item, keyed by the item
 * read. `dependency_item_id` has no foreign key because a deleted or missing
 * target is itself a dependency state the dependent must be re-sent for.
 */
export const itemComputedDependencies = sqliteTable(
  'item_computed_dependencies',
  {
    dependencyItemId: text('dependency_item_id').notNull(),
    dependentItemId: text('dependent_item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.dependencyItemId, table.dependentItemId] }),
    index('item_computed_dependencies_dependent').on(table.dependentItemId),
    check(
      'ck_item_computed_dependencies_not_self',
      sql`${table.dependencyItemId} <> ${table.dependentItemId}`
    ),
  ]
);

/**
 * The published catalogue revision {@link itemComputedDependencies} was last
 * rebuilt against. A single row; absent until the first rebuild.
 */
export const computedDependencyIndexState = sqliteTable(
  'computed_dependency_index_state',
  {
    id: integer('id').primaryKey(),
    catalogueRevision: integer('catalogue_revision').notNull(),
  },
  (table) => [check('ck_computed_dependency_index_state_singleton', sql`${table.id} = 1`)]
);

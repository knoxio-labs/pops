import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Places, as a tree. `parent_id` has no foreign key (Inventory ADR-002 keeps
 * it that way because rebuilding the table inside the migration transaction
 * would cascade into fixtures), so cycles and dangling parents are refused by
 * the writers. `revision`/`seq`/`deleted_at` follow the same contract as on
 * `items`; `created_at`/`updated_at` are nullable only because migration
 * `0012_items_single_identity` could not add them with a non-constant default.
 */
export const locations = sqliteTable(
  'locations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    lastEditedTime: text('last_edited_time').notNull(),
    revision: integer('revision').notNull().default(1),
    seq: integer('seq').notNull().default(0),
    createdAt: text('created_at'),
    updatedAt: text('updated_at'),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('idx_locations_parent').on(table.parentId),
    index('idx_locations_name').on(table.name),
    index('idx_locations_parent_sort').on(table.parentId, table.sortOrder),
    index('locations_seq').on(table.seq),
  ]
);

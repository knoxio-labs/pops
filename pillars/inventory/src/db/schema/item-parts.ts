import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { items } from './items.js';

/**
 * Which assembly an item is a part of (Inventory ADR-001, "Assemblies and
 * parts"). Keyed by the part, so an item is a part of at most one assembly.
 * Placement is independent: a part can sit anywhere, apart from its assembly.
 */
export const itemParts = sqliteTable(
  'item_parts',
  {
    partItemId: text('part_item_id')
      .primaryKey()
      .references(() => items.id, { onDelete: 'cascade' }),
    assemblyItemId: text('assembly_item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    check('ck_item_parts_not_self', sql`${table.partItemId} <> ${table.assemblyItemId}`),
    index('idx_item_parts_assembly').on(table.assemblyItemId),
  ]
);

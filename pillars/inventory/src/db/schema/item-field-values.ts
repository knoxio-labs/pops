import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { itemTypeFields } from './catalogue.js';
import { items } from './items.js';

/** Storage authorities for persisted item field values. */
export const ITEM_FIELD_VALUE_SOURCES = ['stored', 'override'] as const;
/** One of {@link ITEM_FIELD_VALUE_SOURCES}. */
export type ItemFieldValueSource = (typeof ITEM_FIELD_VALUE_SOURCES)[number];

/** The persisted authoritative values for an item under an exact field revision. */
export const itemFieldValues = sqliteTable(
  'item_field_values',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    fieldId: text('field_id').notNull(),
    source: text('source', { enum: ITEM_FIELD_VALUE_SOURCES }).notNull(),
    ordinal: integer('ordinal').notNull(),
    valueJson: text('value_json').notNull(),
    catalogueRevision: integer('catalogue_revision').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.fieldId, table.source, table.ordinal] }),
    foreignKey({
      columns: [table.catalogueRevision, table.fieldId],
      foreignColumns: [itemTypeFields.revision, itemTypeFields.id],
    }),
    uniqueIndex('item_field_values_first_ordinal')
      .on(table.itemId, table.fieldId, table.source)
      .where(sql`${table.ordinal} = 0`),
    index('item_field_values_field_value').on(table.fieldId, table.valueJson),
    index('item_field_values_reference_target')
      .on(
        sql`json_extract(${table.valueJson}, '$.targetKind')`,
        sql`json_extract(${table.valueJson}, '$.targetId')`
      )
      .where(
        sql`json_type(${table.valueJson}, '$.targetKind') = 'text' AND json_type(${table.valueJson}, '$.targetId') = 'text'`
      ),
    check('ck_item_field_values_source', sql`${table.source} IN ('stored', 'override')`),
    check('ck_item_field_values_ordinal', sql`${table.ordinal} >= 0`),
    check('ck_item_field_values_value_json', sql`json_valid(${table.valueJson})`),
  ]
);

import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { catalogueRevisions } from './catalogue-history.js';

/** Full type definitions owned by one catalogue snapshot. */
export const itemTypes = sqliteTable(
  'item_types',
  {
    revision: integer('revision')
      .notNull()
      .references(() => catalogueRevisions.revision),
    id: text('id').notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    sortOrder: integer('sort_order').notNull(),
    capabilitiesJson: text('capabilities_json').notNull(),
    legacyLabelsJson: text('legacy_labels_json').notNull(),
    presentationJson: text('presentation_json').notNull(),
    archivedAt: text('archived_at'),
    replacedBy: text('replaced_by'),
  },
  (table) => [
    primaryKey({ columns: [table.revision, table.id] }),
    check(
      'ck_item_types_replaced_by',
      sql`${table.replacedBy} IS NULL OR (${table.archivedAt} IS NOT NULL AND ${table.replacedBy} <> ${table.id})`
    ),
    uniqueIndex('item_types_revision_key').on(table.revision, sql`${table.key} COLLATE NOCASE`),
    check('ck_item_types_sort_order', sql`${table.sortOrder} >= 0`),
    check(
      'ck_item_types_capabilities_json',
      sql`json_valid(${table.capabilitiesJson}) AND json_type(${table.capabilitiesJson}) = 'array'`
    ),
    check(
      'ck_item_types_legacy_labels_json',
      sql`json_valid(${table.legacyLabelsJson}) AND json_type(${table.legacyLabelsJson}) = 'array'`
    ),
    check(
      'ck_item_types_presentation_json',
      sql`json_valid(${table.presentationJson}) AND json_type(${table.presentationJson}) = 'object'`
    ),
  ]
);

/** Full field definitions owned by one type in one catalogue snapshot. */
export const itemTypeFields = sqliteTable(
  'item_type_fields',
  {
    revision: integer('revision').notNull(),
    id: text('id').notNull(),
    typeId: text('type_id').notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    help: text('help'),
    sortOrder: integer('sort_order').notNull(),
    kind: text('kind').notNull(),
    cardinality: text('cardinality').notNull(),
    required: integer('required').notNull(),
    storage: text('storage').notNull(),
    fixedUnit: text('fixed_unit'),
    referenceKindsJson: text('reference_kinds_json').notNull(),
    referenceTypeIdsJson: text('reference_type_ids_json').notNull(),
    expressionVersion: integer('expression_version'),
    expressionJson: text('expression_json'),
    allowOverride: integer('allow_override').notNull(),
    defaultValuesJson: text('default_values_json').notNull().default('[]'),
    presentationJson: text('presentation_json').notNull(),
    archivedAt: text('archived_at'),
    replacedBy: text('replaced_by'),
  },
  (table) => [
    primaryKey({ columns: [table.revision, table.id] }),
    check(
      'ck_item_type_fields_replaced_by',
      sql`${table.replacedBy} IS NULL OR (${table.archivedAt} IS NOT NULL AND ${table.replacedBy} <> ${table.id})`
    ),
    foreignKey({
      columns: [table.revision, table.typeId],
      foreignColumns: [itemTypes.revision, itemTypes.id],
    }),
    uniqueIndex('item_type_fields_revision_type_key').on(
      table.revision,
      table.typeId,
      sql`${table.key} COLLATE NOCASE`
    ),
    check(
      'ck_item_type_fields_kind',
      sql`${table.kind} IN ('short_text','long_text','integer','decimal','boolean','enum','measurement','date','date_time','url','reference')`
    ),
    check('ck_item_type_fields_sort_order', sql`${table.sortOrder} >= 0`),
    check('ck_item_type_fields_cardinality', sql`${table.cardinality} IN ('one', 'many')`),
    check(
      'ck_item_type_fields_boolean_cardinality',
      sql`${table.kind} <> 'boolean' OR ${table.cardinality} = 'one'`
    ),
    check('ck_item_type_fields_required', sql`${table.required} IN (0, 1)`),
    check('ck_item_type_fields_storage', sql`${table.storage} IN ('stored', 'computed')`),
    check('ck_item_type_fields_allow_override', sql`${table.allowOverride} IN (0, 1)`),
    check(
      'ck_item_type_fields_reference_kinds_json',
      sql`json_valid(${table.referenceKindsJson}) AND json_type(${table.referenceKindsJson}) = 'array'`
    ),
    check(
      'ck_item_type_fields_reference_type_ids_json',
      sql`json_valid(${table.referenceTypeIdsJson}) AND json_type(${table.referenceTypeIdsJson}) = 'array'`
    ),
    check(
      'ck_item_type_fields_presentation_json',
      sql`json_valid(${table.presentationJson}) AND json_type(${table.presentationJson}) = 'object'`
    ),
    check(
      'ck_item_type_fields_default_values_json',
      sql`json_valid(${table.defaultValuesJson}) AND json_type(${table.defaultValuesJson}) = 'array'`
    ),
    check(
      'ck_item_type_fields_expression_json',
      sql`${table.expressionJson} IS NULL OR json_valid(${table.expressionJson})`
    ),
    check(
      'ck_item_type_fields_storage_shape',
      sql`(${table.storage} = 'stored' AND ${table.expressionVersion} IS NULL AND ${table.expressionJson} IS NULL AND ${table.allowOverride} = 0)
        OR (${table.storage} = 'computed' AND ${table.expressionVersion} IS NOT NULL AND ${table.expressionJson} IS NOT NULL)`
    ),
  ]
);

/** Enum options owned by one field in one catalogue snapshot. */
export const fieldEnumOptions = sqliteTable(
  'field_enum_options',
  {
    revision: integer('revision').notNull(),
    id: text('id').notNull(),
    fieldId: text('field_id').notNull(),
    key: text('key').notNull(),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => [
    primaryKey({ columns: [table.revision, table.id] }),
    foreignKey({
      columns: [table.revision, table.fieldId],
      foreignColumns: [itemTypeFields.revision, itemTypeFields.id],
    }),
    uniqueIndex('field_enum_options_revision_field_key').on(
      table.revision,
      table.fieldId,
      sql`${table.key} COLLATE NOCASE`
    ),
    check('ck_field_enum_options_sort_order', sql`${table.sortOrder} >= 0`),
  ]
);

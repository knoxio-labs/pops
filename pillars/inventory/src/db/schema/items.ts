import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

import { locations } from './locations.js';

/**
 * Where an item is: at a place, inside a container item, or in hand
 * (Inventory ADR-002 D2). `ck_items_placement` makes the matching reference
 * column mandatory and the other one null.
 */
export const PLACEMENT_KINDS = ['location', 'container', 'hand'] as const;
/** One of {@link PLACEMENT_KINDS}. */
export type PlacementKind = (typeof PLACEMENT_KINDS)[number];

/**
 * An item's lifecycle, independent of its placement (ADR-002 D3). The reason
 * for a change lives on the `lifecycle_changed` event, never on the row.
 */
export const LIFECYCLES = ['active', 'retired', 'discarded', 'lost', 'destroyed'] as const;
/** One of {@link LIFECYCLES}. */
export type Lifecycle = (typeof LIFECYCLES)[number];

/** A container's access state; `null` on every non-container row (ADR-002 D1). */
export const ACCESS_STATES = ['open', 'closed'] as const;
/** One of {@link ACCESS_STATES}. */
export type AccessState = (typeof ACCESS_STATES)[number];

/**
 * One physical thing, containers included (Inventory ADR-002 D1). Replaces
 * `home_inventory` and `containers` (migration `0012_items_single_identity`).
 *
 * Contract the CHECKs enforce, so no writer can break it:
 * - placement is exactly one of the three kinds with its matching reference;
 * - a previous placement is remembered only while in hand, with exactly one
 *   previous reference and no foreign key (the target may be tombstoned);
 * - `access` is set exactly when `is_container = 1`, `is_full` only then;
 * - `quantity >= 1`, `revision >= 1`, `fields` a JSON object and
 *   `external_ids` a JSON array.
 *
 * `is_container` is derived from the item's type and never written by a
 * client. `seq` is the `events.seq` of the last event that changed the row and
 * has no default, so every writer has to decide it. `location_id` and
 * `containing_item_id` carry no `ON DELETE` action: deletion is a tombstone
 * (`deleted_at`), and a hard delete must move dependants first.
 *
 * The provenance and value columns after `legacy_type` are carried unchanged
 * from `home_inventory` until the Phase D contraction migration.
 */
export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    typeKey: text('type_key'),
    fields: text('fields').notNull().default('{}'),
    note: text('note'),
    code: text('code'),
    externalIds: text('external_ids').notNull().default('[]'),
    quantity: integer('quantity').notNull().default(1),
    lifecycle: text('lifecycle', { enum: LIFECYCLES }).notNull().default('active'),
    lifecycleChangedAt: text('lifecycle_changed_at'),
    placementKind: text('placement_kind', { enum: PLACEMENT_KINDS }).notNull(),
    locationId: text('location_id').references(() => locations.id),
    containingItemId: text('containing_item_id').references((): AnySQLiteColumn => items.id),
    previousPlacementKind: text('previous_placement_kind', { enum: ['location', 'container'] }),
    previousLocationId: text('previous_location_id'),
    previousContainingItemId: text('previous_containing_item_id'),
    isContainer: integer('is_container').notNull().default(0),
    access: text('access', { enum: ACCESS_STATES }),
    isFull: integer('is_full'),
    /** The old free-text `type`; read-only, feeds the "type arrived" match. */
    legacyType: text('legacy_type'),
    /** The old free-text `location`, renamed so it cannot be mistaken for placement. */
    locationText: text('location_text'),
    room: text('room'),
    itemId: text('item_id'),
    brand: text('brand'),
    model: text('model'),
    condition: text('condition').default('Good'),
    inUse: integer('in_use'),
    deductible: integer('deductible'),
    purchaseDate: text('purchase_date'),
    warrantyExpires: text('warranty_expires'),
    replacementValue: real('replacement_value'),
    resaleValue: real('resale_value'),
    purchaseTransactionId: text('purchase_transaction_id'),
    /**
     * Soft cross-pillar reference to finance's transaction,
     * `pops://finance/transaction/<id>`, resolved only by the nightly
     * reconciliation cron.
     */
    purchaseTransactionUri: text('purchase_transaction_uri'),
    /** Set by the reconciliation cron when the URI stops resolving. */
    purchaseTransactionStaleAt: text('purchase_transaction_stale_at'),
    purchasedFromId: text('purchased_from_id'),
    purchasedFromName: text('purchased_from_name'),
    purchasePrice: real('purchase_price'),
    ownerUri: text('owner_uri'),
    ownerStaleAt: text('owner_stale_at'),
    /**
     * Idempotency key for a create driven by another pillar's fan-out, e.g.
     * `pops://purchases/order/<id>/item/<id>`; unique so two concurrent
     * accepts of the same slot mint one item (POPS-2433).
     */
    sourceRef: text('source_ref'),
    notionId: text('notion_id'),
    lastEditedTime: text('last_edited_time').notNull(),
    revision: integer('revision').notNull().default(1),
    seq: integer('seq').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    uniqueIndex('items_code').on(sql`${table.code} COLLATE NOCASE`),
    uniqueIndex('items_source_ref').on(table.sourceRef),
    uniqueIndex('items_notion_id').on(table.notionId),
    index('items_seq').on(table.seq),
    index('items_location').on(table.locationId),
    index('items_containing').on(table.containingItemId),
    index('items_type').on(table.typeKey),
    index('items_lifecycle').on(table.lifecycle),
    index('items_name').on(table.name),
    index('items_in_hand')
      .on(table.id)
      .where(sql`${table.placementKind} = 'hand'`),
    index('items_containers')
      .on(table.id)
      .where(sql`${table.isContainer} = 1`),
    index('items_purchase_uri').on(table.purchaseTransactionUri),
    index('items_owner_uri').on(table.ownerUri),
    index('items_warranty').on(table.warrantyExpires),
    check(
      'ck_items_placement',
      sql`(${table.placementKind} = 'location' AND ${table.locationId} IS NOT NULL AND ${table.containingItemId} IS NULL)
        OR (${table.placementKind} = 'container' AND ${table.containingItemId} IS NOT NULL AND ${table.locationId} IS NULL)
        OR (${table.placementKind} = 'hand' AND ${table.locationId} IS NULL AND ${table.containingItemId} IS NULL)`
    ),
    check(
      'ck_items_previous_placement',
      sql`(${table.previousPlacementKind} IS NULL AND ${table.previousLocationId} IS NULL AND ${table.previousContainingItemId} IS NULL)
        OR (${table.placementKind} = 'hand' AND (
          (${table.previousPlacementKind} IS 'location' AND ${table.previousLocationId} IS NOT NULL AND ${table.previousContainingItemId} IS NULL)
          OR (${table.previousPlacementKind} IS 'container' AND ${table.previousContainingItemId} IS NOT NULL AND ${table.previousLocationId} IS NULL)
        ))`
    ),
    check('ck_items_not_self_contained', sql`${table.containingItemId} <> ${table.id}`),
    check('ck_items_quantity', sql`${table.quantity} >= 1`),
    check(
      'ck_items_lifecycle',
      sql`${table.lifecycle} IN ('active','retired','discarded','lost','destroyed')`
    ),
    check('ck_items_is_container', sql`${table.isContainer} IN (0, 1)`),
    check(
      'ck_items_access',
      sql`(${table.access} IS NULL OR ${table.access} IN ('open','closed')) AND ((${table.isContainer} = 1) = (${table.access} IS NOT NULL))`
    ),
    check(
      'ck_items_is_full',
      sql`${table.isFull} IS NULL OR (${table.isContainer} = 1 AND ${table.isFull} IN (0, 1))`
    ),
    check(
      'ck_items_fields',
      sql`json_valid(${table.fields}) AND json_type(${table.fields}) = 'object'`
    ),
    check(
      'ck_items_external_ids',
      sql`json_valid(${table.externalIds}) AND json_type(${table.externalIds}) = 'array'`
    ),
    check('ck_items_revision', sql`${table.revision} >= 1`),
  ]
);

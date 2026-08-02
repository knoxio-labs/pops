/**
 * `purchase_items`, `purchase_item_units` and `purchase_item_tags` — the
 * line grain and below.
 *
 * A line is what the merchant charged for: "3 × dosing funnel, $35.37". A
 * *unit* is one physical thing with its own identity. They are separate
 * tables because the cardinality genuinely differs: buying three of the
 * same item is one line and up to three inventory records, and hanging a
 * single `inventoryItemUri` off the line cannot express that.
 *
 * Units are created lazily. A line with `quantity: 3` and zero unit rows is
 * normal and complete — units appear only when a unit needs identity, which
 * in practice means a serial number or an inventory fan-out (POPS-245).
 */
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { ITEM_KINDS } from '../../contract/constants.js';
import { purchases, purchaseShipments } from './purchases.js';

export const purchaseItems = sqliteTable(
  'purchase_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    /**
     * Which delivery brought this line. Null is legitimate and common: a
     * digital item is never shipped, and a physical line is unassigned
     * until the merchant says which box it went in. `ON DELETE set null`
     * so removing a shipment orphans its lines rather than destroying them
     * — the money was still spent.
     */
    shipmentId: text('shipment_id').references(() => purchaseShipments.id, {
      onDelete: 'set null',
    }),
    /**
     * The line's position in the source document, preserved so a receipt
     * reads back in the order it was printed.
     *
     * Load-bearing beyond cosmetics: ids are random UUIDs and lines written
     * in one transaction share a `createdAt` to the second, so without this
     * the read order is genuinely non-deterministic — which would break the
     * deterministic candidate ordering the reconciliation engine relies on
     * to make re-derivation safe (ADR-042).
     */
    position: integer('position').notNull().default(0),
    name: text('name').notNull(),
    /** Merchant's product identifier — ASIN, article number, barcode. */
    sku: text('sku'),
    url: text('url'),
    imageUrl: text('image_url'),

    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    /** What the merchant says this line cost, however it applies tax and discount. */
    lineTotalCents: integer('line_total_cents').notNull(),
    /** Running total of *settled* refunds against this line. A failed refund request is not a refund. */
    refundedCents: integer('refunded_cents').notNull().default(0),

    /**
     * Share of order- and shipment-level postage pushed down onto this
     * line. Stored rather than computed on read because the allocation
     * basis (by value, by weight, evenly) is a decision made once at
     * ingest and must not silently change when the read path changes.
     */
    allocatedShippingCents: integer('allocated_shipping_cents').notNull().default(0),
    /**
     * Signed share of order-level tax and discount NOT already inside
     * `lineTotalCents`. Signed because a discount pushes it negative.
     *
     * Landed cost is `lineTotal + allocatedShipping + allocatedAdjustment`.
     * It is derived on read, not stored, so it cannot drift from its parts.
     */
    allocatedAdjustmentCents: integer('allocated_adjustment_cents').notNull().default(0),

    /** The merchant's own category string, kept verbatim. Not a POPS tag. */
    merchantCategory: text('merchant_category'),
    kind: text('kind', { enum: ITEM_KINDS }),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    index('idx_purchase_items_purchase').on(t.purchaseId, t.position),
    index('idx_purchase_items_shipment').on(t.shipmentId),
    index('idx_purchase_items_sku').on(t.sku),
    index('idx_purchase_items_kind').on(t.kind),
  ]
);

/**
 * One physical unit of a line, where that unit needs its own identity.
 *
 * This is the seam to `inventory`: a durable line of quantity 3 becomes up
 * to three inventory items, each with its own warranty, location and
 * resale value. The reference is a soft `pops://` URI with a `staleAt`
 * companion resolved by a nightly cron and never at read time, following
 * `home_inventory.purchaseTransactionUri`.
 */
export const purchaseItemUnits = sqliteTable(
  'purchase_item_units',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    itemId: text('item_id')
      .notNull()
      .references(() => purchaseItems.id, { onDelete: 'cascade' }),
    /** Present in the Amazon export as `Item Serial Number`, and the strongest identity a unit can have. */
    serialNumber: text('serial_number'),
    inventoryItemUri: text('inventory_item_uri'),
    inventoryItemStaleAt: text('inventory_item_stale_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    index('idx_purchase_item_units_item').on(t.itemId),
    index('idx_purchase_item_units_inventory').on(t.inventoryItemUri),
    index('idx_purchase_item_units_serial').on(t.serialNumber),
  ]
);

/**
 * Tags on a line, one row per tag.
 *
 * A join table rather than a JSON array column because the interesting
 * query is "every line tagged `coffee`, across every order" and a JSON
 * column answers that only with a full scan. One grocery shop is ~100
 * lines and the fleet target is thousands a year, so the scan does not
 * stay cheap.
 *
 * Tag slugs are drawn from the finance `tag_vocabulary`; this table holds
 * no vocabulary of its own and deliberately does not constrain the value.
 */
export const purchaseItemTags = sqliteTable(
  'purchase_item_tags',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => purchaseItems.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.tag] }),
    // The cross-order query this table exists to serve.
    index('idx_purchase_item_tags_tag').on(t.tag),
  ]
);

/**
 * `purchases` and `purchase_items` — the purchase document and its lines.
 *
 * All money is integer cents. Never a float dollar value, anywhere, for any
 * reason — the same rule finance enforces (#3665, CF041). Subset-sum in the
 * reconciliation ladder is exact integer arithmetic and stops being exact
 * the moment a float enters.
 *
 * `merchantEntityId` is operative; `merchantEntityName` is only its label.
 * Entities live in `contacts` and are read live — this pillar keeps no
 * entity mirror, so a rename in `contacts` must not require a write here
 * (#3807).
 */
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import {
  INGEST_METHODS,
  ITEM_KINDS,
  PURCHASE_STATUSES,
  SETTLEMENT_MODES,
} from '../../contract/constants.js';
import { purchaseSources } from './sources.js';

export const purchases = sqliteTable(
  'purchases',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    source: text('source')
      .notNull()
      .references(() => purchaseSources.id),
    /** The merchant's own order identifier, when it has one. Not unique: Amazon reuses an order id across shipments. */
    sourceOrderId: text('source_order_id'),
    ingestMethod: text('ingest_method', { enum: INGEST_METHODS }).notNull(),
    /** ISO-8601. Matched against `transaction.date`, NOT against when the row was observed. */
    orderedAt: text('ordered_at').notNull(),
    /** ISO 4217. Per-purchase — one account genuinely spans AUD, USD and BRL. */
    currency: text('currency').notNull(),

    subtotalCents: integer('subtotal_cents').notNull().default(0),
    shippingCents: integer('shipping_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    /** Non-negative magnitude of the discount, subtracted from the total. */
    discountCents: integer('discount_cents').notNull().default(0),
    /**
     * What actually settled — the amount a bank transaction must sum to.
     *
     * Deliberately NOT constrained to `subtotal + shipping + tax - discount`:
     * real merchant exports disagree with their own component columns often
     * enough that a CHECK here would reject valid purchases at ingest. An
     * adapter that finds a mismatch records the purchase and routes it to
     * review rather than forcing the arithmetic.
     */
    totalCents: integer('total_cents').notNull(),

    merchantEntityId: text('merchant_entity_id'),
    merchantEntityName: text('merchant_entity_name'),

    settlementMode: text('settlement_mode', { enum: SETTLEMENT_MODES })
      .notNull()
      .default('unknown'),
    /** Raw payment string as the source stated it, e.g. `Visa - 7373`. Blocking signal for the linker; never parsed into a stored card record. */
    paymentHint: text('payment_hint'),
    /** Pointer back to the evidence this purchase was derived from (file name + row, message id, upload id). */
    rawRef: text('raw_ref'),
    /**
     * Ingest-level dedup key. Unique so re-uploading the same export is a
     * no-op rather than a duplicate — re-ingest must be idempotent because
     * a DSAR bundle is downloaded repeatedly over time.
     */
    checksum: text('checksum').notNull().unique(),

    status: text('status', { enum: PURCHASE_STATUSES }).notNull().default('awaiting_settlement'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    // The linker's hot path: block by source, then scan a date window.
    index('idx_purchases_source_ordered_at').on(t.source, t.orderedAt),
    index('idx_purchases_status').on(t.status),
    index('idx_purchases_merchant_entity').on(t.merchantEntityId),
    index('idx_purchases_source_order_id').on(t.source, t.sourceOrderId),
  ]
);

export const purchaseItems = sqliteTable(
  'purchase_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Merchant's own product identifier — ASIN, article number, barcode. */
    sku: text('sku'),
    url: text('url'),
    imageUrl: text('image_url'),

    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
    /** Running total refunded against this line. Only a settled refund decrements it — a failed refund request is not a refund. */
    refundedCents: integer('refunded_cents').notNull().default(0),

    /** The merchant's own category string, kept verbatim. Not a POPS tag. */
    merchantCategory: text('merchant_category'),
    /** JSON array of tag slugs drawn from the finance `tag_vocabulary`. */
    tags: text('tags').notNull().default('[]'),
    kind: text('kind', { enum: ITEM_KINDS }),

    /**
     * Soft `pops://` reference to an inventory item this line became, with a
     * `staleAt` companion resolved by a nightly cron and never at read time.
     * Follows `home_inventory.purchaseTransactionUri`.
     */
    inventoryItemUri: text('inventory_item_uri'),
    inventoryItemStaleAt: text('inventory_item_stale_at'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index('idx_purchase_items_purchase').on(t.purchaseId),
    index('idx_purchase_items_sku').on(t.sku),
    index('idx_purchase_items_kind').on(t.kind),
  ]
);

/**
 * `purchases` and `purchase_shipments` — the order and its deliveries.
 *
 * **A purchase row is one ORDER**, not one delivery and not one charge. An
 * Amazon order that ships in three boxes and settles as two card charges is
 * one row here, three `purchase_shipments`, and two
 * `purchase_charges`. Collapsing any of those three grains into
 * the others loses information that cannot be recovered: shipment-grain
 * purchases lose the order's identity, and order-grain-only loses carrier,
 * tracking and per-delivery cost.
 *
 * All money is integer cents. Never a float dollar value, anywhere, for any
 * reason — the same rule finance enforces on
 * `pillars/finance/src/db/schema/transactions.ts`. Subset-sum in the
 * reconciliation ladder is exact integer arithmetic and stops being exact
 * the moment a float enters.
 *
 * `merchantEntityId` is operative; `merchantEntityName` is only its label.
 * Entities live in `contacts` and are read live — this pillar keeps no
 * entity mirror, so a rename in `contacts` must not require a write here.
 * Finance carries the same invariant on `transaction_corrections`.
 */
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import {
  INGEST_METHODS,
  PURCHASE_STATUSES,
  SETTLEMENT_MODES,
  SHIPMENT_STATUSES,
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
    /** The merchant's own order identifier. One per order, hence the unique below. */
    sourceOrderId: text('source_order_id'),
    ingestMethod: text('ingest_method', { enum: INGEST_METHODS }).notNull(),
    /**
     * ISO-8601. Matched against `transaction.date`, NOT against when the row
     * was observed.
     *
     * Held in exactly one spelling — `YYYY-MM-DDTHH:MM:SS.sssZ` — because
     * the column is TEXT and every window, ordering and equality on it is
     * lexicographic. The write path is what enforces that; see
     * `../services/ordered-at.ts` for why it is enforced there rather than
     * wrapped around each read.
     */
    orderedAt: text('ordered_at').notNull(),
    /**
     * Minutes ahead of UTC where the order was placed, at {@link orderedAt}.
     *
     * `orderedAt` is spelled in UTC so that a text comparison is a
     * chronological one, and that spelling destroys the only evidence of
     * WHERE the order happened. Without this column the merchant-local
     * calendar day is unrecoverable: a 9am Sydney receipt is stored as
     * `23:00Z` the day before, and a reader with the instant alone can only
     * name the day in Greenwich and date the shop a day early.
     *
     * A signed offset rather than an IANA zone, because the ingest paths
     * cannot always honestly supply a zone — a camera's EXIF and a client's
     * `capturedAt` state an offset and name no place, and `purchase_capture`
     * records the same fact in the same shape for the same reason. Bounded
     * ±14:00, the widest any zone has used.
     *
     * Nullable, and null is not a defect: an adapter whose source states an
     * instant rather than a printed wall clock — Amazon's exports — never
     * knew an offset to record, and a row written before this column existed
     * cannot have one invented for it from the instant it kept.
     */
    orderedAtOffsetMinutes: integer('ordered_at_offset_minutes'),
    /**
     * ISO 4217 currency the order was priced in. NOT necessarily the
     * currency it settled in — an AliExpress order priced in USD settles as
     * AUD on the card. The link table carries both sides.
     */
    currency: text('currency').notNull(),

    subtotalCents: integer('subtotal_cents').notNull().default(0),
    /**
     * Order-level shipping as the merchant stated it. Per-delivery shipping
     * lives on `purchase_shipments.shippingCents`; this is the roll-up, and
     * the two need not agree when the merchant only quotes one of them.
     */
    shippingCents: integer('shipping_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    /**
     * A fee the merchant adds at the till — a card surcharge, a small-order
     * fee. Real money paid, and none of the other components describe it:
     * not goods, not tax, not shipping, and not a discount.
     */
    surchargeCents: integer('surcharge_cents').notNull().default(0),
    /** Non-negative magnitude of the discount, subtracted from the total. */
    discountCents: integer('discount_cents').notNull().default(0),
    /**
     * What the order is expected to cost in {@link currency}.
     *
     * Deliberately NOT constrained to `subtotal + shipping + tax - discount`:
     * real merchant exports disagree with their own component columns often
     * enough that a CHECK here would reject valid orders at ingest. An
     * adapter that finds a mismatch records the order and routes it to
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
    /** Pointer back to the evidence this order was derived from (file name + row, message id, upload id). */
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
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    // A merchant order id identifies one order. Stronger than `checksum`,
    // which is only as good as the adapter's hashing choice: if an adapter
    // changes its checksum recipe, this still stops a re-import from
    // duplicating every order. NULLs don't collide in SQLite, so
    // manually-entered orders with no merchant id are unaffected.
    unique('uq_purchases_source_order').on(t.source, t.sourceOrderId),
    // The linker's hot path: block by source, then scan a date window.
    index('idx_purchases_source_ordered_at').on(t.source, t.orderedAt),
    index('idx_purchases_status').on(t.status),
    index('idx_purchases_merchant_entity').on(t.merchantEntityId),
  ]
);

/**
 * One delivery of an order.
 *
 * Exists because delivery facts have nowhere else to live: carrier,
 * tracking, the date it actually arrived, and what postage cost for THIS
 * box rather than the order as a whole. An AliExpress order whose items
 * arrive across two months is one `purchases` row and many of these.
 *
 * Deliberately NOT assumed to align with charges. Amazon sometimes charges
 * per product group rather than per box, and whether AliExpress's
 * purchase-time groupings map to deliveries is unverified. A charge may
 * reference a shipment when the attribution is known and simply doesn't
 * when it isn't — see `purchase_charges.shipmentId`.
 */
export const purchaseShipments = sqliteTable(
  'purchase_shipments',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    /**
     * The merchant's own shipment identifier where one exists. Amazon's DSAR
     * export has none, so its adapter synthesises `(orderId, shipDate)`.
     */
    sourceShipmentRef: text('source_shipment_ref'),
    /** Order within the parent order. See `purchase_items.position` for why. */
    position: integer('position').notNull().default(0),
    carrier: text('carrier'),
    trackingNumber: text('tracking_number'),
    shippedAt: text('shipped_at'),
    deliveredAt: text('delivered_at'),
    status: text('status', { enum: SHIPMENT_STATUSES }).notNull().default('pending'),
    /** Postage attributable to this delivery, in the order's currency. */
    shippingCents: integer('shipping_cents').notNull().default(0),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    index('idx_purchase_shipments_purchase').on(t.purchaseId),
    index('idx_purchase_shipments_status').on(t.status),
    index('idx_purchase_shipments_delivered_at').on(t.deliveredAt),
    unique('uq_purchase_shipments_source_ref').on(t.purchaseId, t.sourceShipmentRef),
  ]
);

/**
 * Facts about a whole order that are not fields.
 *
 * **Not the order-grain twin of `purchase_item_tags`**, despite the shape.
 * An item tag classifies a product and is either proposed or asserted; a
 * row here records how the order itself was read. The first use is
 * `date-uncertain`: a receipt that stated no date is dated from its upload
 * so the purchase exists and can be reviewed, and the tag is what stops
 * that inferred date reading as a fact the paper stated. There is nothing
 * to confirm about it — the paper either said or it did not — so this table
 * carries no confirmation marker.
 *
 * Free-form on purpose. `merchant-uncertain` and `total-uncertain` will
 * want the same treatment, and a closed enum would mean a migration for
 * each.
 */
export const purchaseTags = sqliteTable(
  'purchase_tags',
  {
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    primaryKey({ columns: [t.purchaseId, t.tag] }),
    // "Show me everything needing a human" across every order.
    index('idx_purchase_tags_tag').on(t.tag),
  ]
);

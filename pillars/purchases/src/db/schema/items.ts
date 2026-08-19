/**
 * `purchase_items`, `purchase_item_units`, `purchase_item_tags` and
 * `purchase_item_notes` — the line grain and below.
 *
 * A line is what the merchant charged for: "3 × dosing funnel, $35.37". A
 * *unit* is one physical thing with its own identity. They are separate
 * tables because the cardinality genuinely differs: buying three of the
 * same item is one line and up to three inventory records, and hanging a
 * single `inventoryItemUri` off the line cannot express that.
 *
 * Units are created lazily. A line with `quantity: 3` and zero unit rows is
 * normal and complete — units appear only when a unit needs identity, which
 * in practice means a serial number or an inventory fan-out.
 *
 * Tags and notes are split by **who asserted the value**. A note is
 * something the merchant printed and an adapter transcribed; a tag is a
 * classification nothing in any source states, so it is either proposed by
 * a classification pass or asserted by a human, and `confirmedAt` is what
 * tells those apart.
 */
import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { ITEM_KINDS, SKU_SCHEMES } from '../../contract/constants.js';
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
    /**
     * The product identifier the merchant stated, verbatim, and never
     * without {@link skuScheme} — see that column for why a bare one is not
     * an identity.
     *
     * NULL is the ordinary case and means the source stated none, which is
     * every shipped adapter but `amazon`. It does not mean a transcription
     * was skipped, and nothing downstream may treat two NULLs as a match:
     * SQL `GROUP BY` folds them into one group, which is how ~490 grocery
     * lines become a single decision.
     */
    sku: text('sku'),
    /**
     * Which namespace {@link sku} lives in, so its reach is stated rather
     * than assumed. `ITEM_KINDS`' arrangement: the vocabulary is declared
     * contract-side in {@link SKU_SCHEMES} and enforced by a CHECK.
     *
     * The pair is total, but only one direction of it is a CHECK: a
     * namespace with nothing in it is rejected by the database, while an
     * identifier with no namespace is prevented one layer up, by
     * `CreateItemInput` carrying both halves as a single value that the
     * insert splits at one site. SQLite cannot add the second CHECK to a
     * table that already exists without a rebuild, and rebuilding this one
     * would cascade every tag, note, unit and allocation off its lines.
     *
     * The wire fuses the two back into one object for the reason
     * `Classified<T>` gives: a consumer must not be able to reach the value
     * without the qualifier that says how far it means anything.
     */
    skuScheme: text('sku_scheme', { enum: SKU_SCHEMES }),
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

    /**
     * The merchant's own category string, kept verbatim. Not a POPS tag,
     * and not a condition — see {@link merchantCondition}.
     *
     * Empty on every row the shipped adapters write, because no shipped
     * source states a category: Amazon's DSAR export has 28 columns and
     * none of them is one, and a till receipt prints none. That is the
     * honest state, not a gap to fill with something adjacent.
     */
    merchantCategory: text('merchant_category'),
    /**
     * What condition the merchant sold it in — Amazon's `Product
     * Condition`, verbatim. Its own column because a condition answers a
     * different question from a category, and overloading one on the other
     * put `New` and a tax flag in the same bag.
     */
    merchantCondition: text('merchant_condition'),
    /**
     * `^` on a Woolworths receipt: this line was sold at a promotional
     * price. NULL where the source does not state it either way, which is
     * every source but that one.
     */
    promotionalPrice: integer('promotional_price', { mode: 'boolean' }),
    /** `#` on a Woolworths receipt: GST applies to this line. NULL where unstated. */
    gstApplicable: integer('gst_applicable', { mode: 'boolean' }),
    /**
     * What the line item is. Never read without {@link kindConfirmedAt} —
     * the column is part judgement and part machine proposal, and the two
     * are not interchangeable.
     */
    kind: text('kind', { enum: ITEM_KINDS }),
    /**
     * When {@link kind} stopped being a proposal.
     *
     * NULL means a classification pass proposed it and a re-run is free to
     * reconsider. Non-null means it was *asserted* — by a human through
     * `PATCH /purchases/:id/items/:itemId`, or at ingest by a source that
     * stated the kind outright — and nothing may re-derive it. The same
     * idiom `purchase_charge_links.confirmedAt` carries, deliberately,
     * rather than a second way of saying the same thing.
     *
     * A CHECK makes the pair total: a confirmation cannot exist without a
     * value, so there is no "confirmed unknown" state for a consumer to
     * mishandle. Retracting a wrong confirmation clears both and returns
     * the line to unclassified.
     */
    kindConfirmedAt: text('kind_confirmed_at'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [
    index('idx_purchase_items_purchase').on(t.purchaseId, t.position),
    index('idx_purchase_items_shipment').on(t.shipmentId),
    // Scheme first: "every line carrying this ASIN" is the repeat-purchase
    // question, and it is only well posed within one namespace. A lookup on
    // the identifier alone is the merge this pair exists to prevent.
    index('idx_purchase_items_sku').on(t.skuScheme, t.sku),
    // Composite because both hot predicates read the pair: the proposal
    // pass wants unclassified lines, and a consumer wants confirmed ones.
    index('idx_purchase_items_kind').on(t.kind, t.kindConfirmedAt),
    // "Was this on special", across every order — the one cross-order
    // question the `promotional-price` tag rows were ever any use for.
    // Partial, because the answer nobody asks for is "no".
    index('idx_purchase_items_promotional_price')
      .on(t.promotionalPrice)
      .where(sql`${t.promotionalPrice} = 1`),
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
    /**
     * Intended to hold the serial engraved on the hardware, the identity an
     * owner can read off the item itself. Free text: callers set it over
     * `POST /purchases` and nothing validates what arrives.
     *
     * Not the Amazon DSAR export's `Item Serial Number`. On the reference
     * bundle measured 2026-08-11, 28 of its 31 populated rows carry an
     * `Authenticity_2D=AZ:...` token — Amazon's Transparency anti-counterfeit
     * code, which identifies a *package*, not the device inside it. The
     * remaining three carry no prefix and nothing says what they are, so the
     * column cannot be sorted by inspection either. No ingest adapter in this
     * repo writes it; see
     * `pillars/purchases/src/ingest/amazon/README.md`.
     */
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
 * Item tags on a line, one row per tag.
 *
 * A join table rather than a JSON array column because the interesting
 * query is "every line tagged `coffee`, across every order" and a JSON
 * column answers that only with a full scan. One grocery shop is ~100
 * lines and the fleet target is thousands a year, so the scan does not
 * stay cheap.
 *
 * **Purchases owns this vocabulary.** It is not finance's
 * `tag_vocabulary`, which is transaction-grained and describes what a
 * payment was — `Groceries`, `Eat Out`. An item tag is product-grained and
 * describes what the thing is: `fruit`, `healthy`. Two taxonomies at two
 * grains, and making one serve both is what produced the docstring this
 * one replaces.
 *
 * Open rather than a compiled enum, for the reason `purchase_sources` is
 * rows: adding `sourdough` must be a write, not a deploy. The shape is
 * constrained instead — lower-case slugs, enforced on the write path, so
 * `Fruit` and `fruit` cannot become two tags the way finance's Title Case
 * labels drifted.
 *
 * No source states an item tag, so nothing writes one at ingest except a
 * caller asserting it by hand. {@link confirmedAt} carries the same
 * meaning it does on the line's `kind`.
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
    /**
     * NULL means a classification pass proposed this tag; non-null means it
     * was asserted. Unlike the line's `kind` the pair needs no CHECK — the
     * marker lives on the row that carries the value, so a reader cannot
     * physically hold one without the other.
     */
    confirmedAt: text('confirmed_at'),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.tag] }),
    // The cross-order query this table exists to serve.
    index('idx_purchase_item_tags_tag').on(t.tag),
  ]
);

/**
 * Verbatim merchant prose about a line, in the order it was printed.
 *
 * `PRICE REDUCED BY $7.26 each`, `0.202 kg NET @ $2.90/kg`. Evidence, not
 * classification — a reviewer checking a reading against the paper needs
 * the wording, and the arithmetic it describes was already done by the
 * merchant.
 *
 * Its own table rather than tag rows, on the tag table's own reasoning:
 * that table exists to answer `WHERE tag = ?` across every order, and
 * nobody will ever ask for every line whose note is
 * `0.512 kg NET @ $4.00/kg`. Two things follow from prose that the tag
 * shape could not represent — notes are **ordered**, and two identical
 * notes on one line are two notes. `(item_id, position)` gives both;
 * `(item_id, tag)` plus a Set silently collapsed them.
 *
 * Deliberately unindexed beyond its primary key. There is no cross-order
 * query over prose, and an index on one would be dead weight the size of
 * the table.
 */
export const purchaseItemNotes = sqliteTable(
  'purchase_item_notes',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => purchaseItems.id, { onDelete: 'cascade' }),
    /** Position in the source document, from zero. */
    position: integer('position').notNull(),
    note: text('note').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.position] })]
);

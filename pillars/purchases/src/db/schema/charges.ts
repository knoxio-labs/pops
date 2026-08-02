/**
 * `purchase_charges`, `purchase_charge_links` and
 * `purchase_item_allocations` — the money layer.
 *
 * **A charge exists whether or not finance has seen it.** The merchant
 * tells us it took $56.78 off a Visa on the 2nd; the bank statement that
 * proves it may not be imported for a month. Modelling the charge as
 * nothing more than a link to a `finance` transaction — which an earlier
 * draft of this schema did — makes that month invisible: the order looks
 * unexplained when in fact we know exactly what was charged and are only
 * waiting for the counterpart to land.
 *
 * So there are two tables, not one:
 *
 *   `purchase_charges`       what was (or will be) charged. Merchant-asserted
 *                            or engine-derived. Never depends on finance.
 *   `purchase_charge_links`  charge ↔ `pops://finance/transaction/<id>`.
 *                            Absent until the transaction lands.
 *
 * That split makes the useful question answerable: of an order's total, how
 * much is matched to a real transaction, how much is a charge we know about
 * but haven't matched yet, and how much is genuinely unaccounted for.
 *
 * `finance.transactions` gets no schema change and no foreign key points at
 * it — the reference is a soft URI, which is what lets the two pillars be
 * deployed, migrated and restored independently (ADR-042).
 */
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import {
  CHARGE_ORIGINS,
  LINK_TYPES,
  MIN_MATCH_CONFIDENCE,
  SETTLEMENT_ROLES,
} from '../../contract/constants.js';
import { purchaseItems } from './items.js';
import { purchases, purchaseShipments } from './purchases.js';
import { purchaseMatchRules } from './rules.js';

export const purchaseCharges = sqliteTable(
  'purchase_charges',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    purchaseId: text('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    /**
     * The delivery this charge is attributable to, when that is known.
     *
     * Nullable and expected to stay null much of the time. Amazon sometimes
     * charges per product group rather than per box, and whether
     * AliExpress's purchase-time groupings correspond to deliveries is
     * unverified. Rather than inventing a "charge block" entity on a guess,
     * a charge belongs to the order — always correct — and names a shipment
     * only when the evidence supports it. If blocks do turn out to equal
     * deliveries, that shows up as this column being reliably populated,
     * and the entity can be introduced then with real data behind it.
     */
    shipmentId: text('shipment_id').references(() => purchaseShipments.id, {
      onDelete: 'set null',
    }),
    /** The merchant's own identifier for this charge, where it has one. */
    sourceChargeRef: text('source_charge_ref'),
    /** Order within the parent order. See `purchase_items.position` for why. */
    position: integer('position').notNull().default(0),

    /** Signed integer cents in {@link currency}. Negative for a refund. */
    amountCents: integer('amount_cents').notNull(),
    /**
     * ISO 4217 the charge settles in — the ACCOUNT's currency, which for a
     * USD AliExpress order is still AUD. Subset-sum matches on this side,
     * because this is the unit finance transactions are in.
     */
    currency: text('currency').notNull(),
    /**
     * The same money expressed in the ORDER's currency, which is the unit
     * the residual is computed in. Equal to {@link amountCents} whenever
     * the two currencies match — the common case, stored anyway so the
     * residual never has to branch on whether an order was foreign.
     */
    orderAmountCents: integer('order_amount_cents').notNull(),

    /** When the merchant says the charge happened. Null when only the amount is known. */
    chargedAt: text('charged_at'),
    /** What the money is. `authorization` is recorded but excluded from the residual. */
    role: text('role', { enum: SETTLEMENT_ROLES }).notNull().default('capture'),
    /** Raw payment string as the source stated it, e.g. `Visa - 7373`. */
    paymentHint: text('payment_hint'),
    /**
     * `merchant` — the source asserted this charge. `derived` — the engine
     * minted it to hold a transaction it matched against an order whose
     * source gives no charge breakdown at all (a bare receipt). Kept
     * distinct so a merchant's own figures are never silently overwritten
     * by an inference.
     */
    origin: text('origin', { enum: CHARGE_ORIGINS }).notNull().default('merchant'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    unique('uq_purchase_charges_source_ref').on(t.purchaseId, t.sourceChargeRef),
    index('idx_purchase_charges_purchase').on(t.purchaseId),
    index('idx_purchase_charges_shipment').on(t.shipmentId),
    index('idx_purchase_charges_charged_at').on(t.chargedAt),
    index('idx_purchase_charges_role').on(t.role),
  ]
);

/**
 * A charge matched to a finance transaction.
 *
 * N:M rather than a column on the charge, because both directions happen:
 * one transaction can settle charges from several orders (a combined
 * settlement), and occasionally one charge is covered by more than one
 * transaction.
 *
 * `confirmedAt` is the whole state machine. NULL means the engine derived
 * it and it is disposable: a sweep tears down every unconfirmed link in the
 * affected window and re-solves from scratch. Non-NULL means a human
 * accepted it, and it is pinned — never auto-revised, and acting as a fixed
 * constraint that removes its charge and transaction from the solvable set.
 */
export const purchaseChargeLinks = sqliteTable(
  'purchase_charge_links',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    chargeId: text('charge_id')
      .notNull()
      .references(() => purchaseCharges.id, { onDelete: 'cascade' }),
    /** Soft cross-pillar URI: `pops://finance/transaction/<id>`. Deliberately not a foreign key. */
    transactionUri: text('transaction_uri').notNull(),
    /** Signed integer cents in the charge's settlement currency. */
    amountCents: integer('amount_cents').notNull(),
    linkType: text('link_type', { enum: LINK_TYPES }).notNull(),
    confidence: real('confidence').notNull().default(MIN_MATCH_CONFIDENCE),
    matchRuleId: text('match_rule_id').references(() => purchaseMatchRules.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    /** NULL = engine-derived and disposable. Non-NULL = human-confirmed and pinned. */
    confirmedAt: text('confirmed_at'),
  },
  (t) => [
    unique('uq_purchase_charge_links').on(t.chargeId, t.transactionUri),
    index('idx_purchase_charge_links_charge').on(t.chargeId),
    index('idx_purchase_charge_links_transaction').on(t.transactionUri),
    // The sweep's tear-down predicate: every unconfirmed link, cheaply.
    index('idx_purchase_charge_links_confirmed_at').on(t.confirmedAt),
  ]
);

/**
 * How one charge distributes across the lines it paid for.
 *
 * This is what makes "which charge paid for the grinder?" and "how much of
 * this refund was the cable?" answerable. Without it, attribution stops at
 * the order and every per-item money question is a guess.
 *
 * Hangs off the CHARGE, not off the charge↔transaction link: which items a
 * charge covers is knowable the moment the merchant states the charge, and
 * does not become more or less true when the bank statement arrives.
 *
 * Amounts are in the ORDER's currency, matching `purchase_items` — a line's
 * price and its funding must be comparable without an FX step.
 */
export const purchaseItemAllocations = sqliteTable(
  'purchase_item_allocations',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    chargeId: text('charge_id')
      .notNull()
      .references(() => purchaseCharges.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => purchaseItems.id, { onDelete: 'cascade' }),
    /** Signed integer cents in the order's currency. Negative when the parent charge is a refund. */
    amountCents: integer('amount_cents').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    unique('uq_purchase_item_allocations').on(t.chargeId, t.itemId),
    index('idx_purchase_item_allocations_charge').on(t.chargeId),
    index('idx_purchase_item_allocations_item').on(t.itemId),
  ]
);

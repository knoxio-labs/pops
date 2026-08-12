/**
 * Closed vocabularies shared by the purchases contract and its persistence
 * layer. Declared here (contract side) and imported by `src/db/schema/*` so
 * a value can never drift between the wire format and the CHECK constraint
 * that enforces it — the same arrangement finance uses for
 * `TRANSACTION_TYPES` (`pillars/finance/src/contract/corrections-constants.ts`).
 *
 * Adding a value to any of these lists means writing a migration that widens
 * the corresponding CHECK. They are deliberately closed: an open string
 * column would let a broken ingest adapter write a status nothing reads.
 *
 * `purchase_sources` is the deliberate exception — merchants are ROWS, not a
 * compiled enum, so adding one is an insert rather than a deploy (ADR-035).
 */

/** How a purchase document entered the pillar. */
export const INGEST_METHODS = ['email', 'export', 'upload', 'manual'] as const;
export type IngestMethod = (typeof INGEST_METHODS)[number];

/**
 * How the purchase is (or will be) paid for.
 *
 * `cash` is terminal: no transaction will ever exist for it, so it is
 * excluded from the reconcile queue and from any "never settled" prompt,
 * while still counting in every spend analysis (ADR-042).
 */
export const SETTLEMENT_MODES = ['card', 'cash', 'unknown'] as const;
export type SettlementMode = (typeof SETTLEMENT_MODES)[number];

/**
 * Reconciliation state of an order.
 *
 * `awaiting_settlement` is a normal, permanent, valid state — a receipt
 * captured before its card statement is imported is correct, not broken.
 */
export const PURCHASE_STATUSES = [
  'awaiting_settlement',
  'linked',
  'partial',
  'settled_cash',
  'ignored',
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/**
 * Fulfilment state of one delivery.
 *
 * `cancelled` and `returned` matter to spend: a cancelled shipment's items
 * were never received and a returned one generates a refund charge, and
 * both must be visible rather than deleted.
 */
export const SHIPMENT_STATUSES = [
  'pending',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/**
 * What a line item is, which decides who may want to fan out from it —
 * `durable` proposes to inventory, `consumable` proposes to the food
 * pantry. Both are proposals; neither is automatic — unattended fan-out
 * fills those pillars with cables and single-use ingredients, after which
 * the user stops trusting them.
 */
export const ITEM_KINDS = ['consumable', 'durable', 'digital', 'service'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * The shape of a POPS item tag — purchases' own product-grained vocabulary
 * (`fruit`, `healthy`, `single-origin`), not finance's transaction-grained
 * `tag_vocabulary`.
 *
 * The vocabulary itself is open, for the reason `purchase_sources` is rows:
 * adding `sourdough` must be a write, not a deploy. Only the *shape* is
 * closed, and only because finance's Title Case labels show what happens
 * without it — `Fruit` and `fruit` become two tags nothing joins.
 */
export const ITEM_TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

/** True when `value` is a well-formed item tag slug. */
export function isItemTag(value: string): boolean {
  return ITEM_TAG_PATTERN.test(value);
}

/**
 * How a charge↔transaction link was derived.
 *
 * Derivation only. What the money *is* — a capture, a hold, a refund — is
 * {@link SETTLEMENT_ROLES}, which is orthogonal: a refund can be matched
 * exactly or by subset-sum just as a capture can. Conflating the two (an
 * earlier draft had `refund` as a link type) makes "an exactly-matched
 * refund" inexpressible.
 */
export const LINK_TYPES = ['exact', 'split', 'combined', 'partial', 'rule', 'manual'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

/**
 * Where a charge came from.
 *
 * `merchant` — the source stated it, so the figure is authoritative and an
 * inference must never overwrite it. `derived` — the engine minted a charge
 * to hold a transaction it matched against an order whose source gives no
 * charge breakdown at all, e.g. a bare till receipt.
 */
export const CHARGE_ORIGINS = ['merchant', 'derived'] as const;
export type ChargeOrigin = (typeof CHARGE_ORIGINS)[number];

/**
 * What the linked money actually is.
 *
 * `authorization` is the load-bearing one. A card hold and its later
 * capture are two transactions for one charge; counting both against the
 * order drives the residual negative and makes a correct order look
 * over-linked. Authorizations are linked (so they are visibly accounted
 * for) but **excluded from the residual**.
 *
 * `adjustment` covers a merchant re-charging a price difference after the
 * fact — rare, but it is neither a fresh capture nor a refund.
 */
export const SETTLEMENT_ROLES = ['capture', 'authorization', 'refund', 'adjustment'] as const;
export type SettlementRole = (typeof SETTLEMENT_ROLES)[number];

/** Roles that count toward `totalCents − Σ amount`. See {@link SETTLEMENT_ROLES}. */
export const RESIDUAL_BEARING_ROLES: readonly SettlementRole[] = [
  'capture',
  'refund',
  'adjustment',
];

/** True when a charge in this role moves the residual. */
export function isResidualBearing(role: SettlementRole): boolean {
  return RESIDUAL_BEARING_ROLES.includes(role);
}

/** How a learned match rule's pattern is applied. Mirrors finance. */
export const MATCH_TYPES = ['exact', 'contains', 'regex'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

/**
 * Kind of evidence a linked `documents` record holds. A tax invoice is the
 * arbiter when the CSV's own arithmetic is ambiguous; a delivery photo is
 * proof of receipt for an insurance claim.
 */
export const DOCUMENT_KINDS = [
  'tax_invoice',
  'receipt',
  'order_confirmation',
  'delivery_photo',
  'other',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * Whether a source's links may be applied without review. Grocery must be
 * `auto` or it will be abandoned — ~6,000 line items a year from one
 * merchant cannot pass through a human queue (ADR-042).
 */
export const AUTO_LINK_POLICIES = ['auto', 'review'] as const;
export type AutoLinkPolicy = (typeof AUTO_LINK_POLICIES)[number];

/**
 * Floor for a stored match confidence. Mirrors finance's
 * `MIN_MATCH_CONFIDENCE` so a rule migrated between the two pillars keeps
 * its meaning.
 */
export const MIN_MATCH_CONFIDENCE = 0.5;

/**
 * Default matching window, in days, between `transaction.date` and
 * `purchase.orderedAt`. Per-source overridable via
 * `purchase_sources.settlementWindowDays`.
 *
 * Deliberately narrow. Import lag is absorbed by perpetual retry, not by a
 * wide window — widening it to accommodate lag would trade precision for a
 * problem retry already solves (ADR-042).
 */
export const DEFAULT_SETTLEMENT_WINDOW_DAYS = 21;

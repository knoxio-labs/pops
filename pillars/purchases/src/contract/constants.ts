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
 * Reconciliation state of a purchase.
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
 * What a line item is, which decides who may want to fan out from it —
 * `durable` proposes to inventory, `consumable` proposes to the food
 * pantry. Both are proposals; neither is automatic (POPS-245, POPS-246).
 */
export const ITEM_KINDS = ['consumable', 'durable', 'digital', 'service'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * How a purchase↔transaction link was derived. The first four come out of
 * the reconciliation ladder (POPS-237); `refund` carries a negative amount;
 * `manual` is a human assertion and is always confirmed on creation.
 */
export const LINK_TYPES = ['exact', 'split', 'combined', 'partial', 'refund', 'manual'] as const;
export type LinkType = (typeof LINK_TYPES)[number];

/** How a learned match rule's pattern is applied. Mirrors finance. */
export const MATCH_TYPES = ['exact', 'contains', 'regex'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

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

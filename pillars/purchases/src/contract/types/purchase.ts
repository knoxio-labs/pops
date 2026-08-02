import type {
  IngestMethod,
  ItemKind,
  LinkType,
  PurchaseStatus,
  SettlementMode,
} from '../constants.js';

/**
 * A purchase document — what was bought, from whom, for how much.
 *
 * Authoritative independently of any transaction. A purchase with no link
 * is a normal, permanent, valid state, and every spend figure reads from
 * here regardless of link state (ADR-042).
 *
 * All money fields are integer cents in {@link currency}.
 */
export interface Purchase {
  id: string;
  /** Slug of the `purchase_sources` row this came from. */
  source: string;
  /** The merchant's own order identifier, when it has one. */
  sourceOrderId: string | null;
  ingestMethod: IngestMethod;
  /** ISO-8601. The date the linker matches against, not the ingest date. */
  orderedAt: string;
  /** ISO 4217 currency code. */
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  /** Non-negative magnitude of the discount applied. */
  discountCents: number;
  /** What settled. Not necessarily the sum of the component fields. */
  totalCents: number;
  /** Operative merchant reference into `contacts`. */
  merchantEntityId: string | null;
  /** Display label for {@link merchantEntityId}. Never resolve from this. */
  merchantEntityName: string | null;
  settlementMode: SettlementMode;
  /** Raw payment string as the source stated it, e.g. `Visa - 7373`. */
  paymentHint: string | null;
  /** Pointer back to the evidence this was derived from. */
  rawRef: string | null;
  checksum: string;
  status: PurchaseStatus;
  createdAt: string;
  updatedAt: string;
}

/** One line of a {@link Purchase}. */
export interface PurchaseItem {
  id: string;
  purchaseId: string;
  name: string;
  /** Merchant's product identifier — ASIN, article number, barcode. */
  sku: string | null;
  url: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /** Settled refunds against this line. A failed refund request is not a refund. */
  refundedCents: number;
  /** The merchant's own category string, verbatim. Not a POPS tag. */
  merchantCategory: string | null;
  /**
   * Tag slugs drawn from the finance `tag_vocabulary`. Mutable rather than
   * `readonly` so the interface matches `PurchaseItemSchema`'s inferred
   * shape exactly — a `readonly` here would not be assignable to the
   * contract's own response type.
   */
  tags: string[];
  kind: ItemKind | null;
  /** Soft `pops://` reference to the inventory item this became. */
  inventoryItemUri: string | null;
  inventoryItemStaleAt: string | null;
  createdAt: string;
}

/**
 * A link between a purchase and a finance transaction.
 *
 * `confirmedAt === null` means the engine derived it and a sweep may tear
 * it down and re-derive it. Non-null means a human pinned it.
 */
export interface PurchaseTransactionLink {
  id: string;
  purchaseId: string;
  /** `pops://finance/transaction/<id>`. A soft URI, not a foreign key. */
  transactionUri: string;
  /** Signed integer cents. Negative for a refund. */
  amountCents: number;
  linkType: LinkType;
  confidence: number;
  matchRuleId: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

import type {
  ChargeOrigin,
  DocumentKind,
  IngestMethod,
  ItemKind,
  LinkType,
  PurchaseStatus,
  SettlementMode,
  SettlementRole,
  ShipmentStatus,
} from '../constants.js';

/**
 * An order — the single point of entry for a purchase event.
 *
 * Authoritative independently of any transaction. An order with no matched
 * charge is a normal, permanent, valid state, and every spend figure reads
 * from here regardless (ADR-042).
 *
 * All money fields are integer cents in {@link currency}.
 */
export interface Purchase {
  id: string;
  /** Slug of the `purchase_sources` row this came from. */
  source: string;
  /** The merchant's own order identifier. Unique per source. */
  sourceOrderId: string | null;
  ingestMethod: IngestMethod;
  /** ISO-8601. The date the linker matches against, not the ingest date. */
  orderedAt: string;
  /** ISO 4217 the order was PRICED in — not necessarily what it settled in. */
  currency: string;
  subtotalCents: number;
  /** Order-level postage as the merchant stated it. Per-delivery postage is on the shipment. */
  shippingCents: number;
  taxCents: number;
  /** A fee the merchant added: a card surcharge, a small-order fee. */
  surchargeCents: number;
  /** Non-negative magnitude of the discount applied. */
  discountCents: number;
  /** What the order is expected to cost. Not necessarily the sum of the components above. */
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

/** One delivery of an order. */
export interface PurchaseShipment {
  id: string;
  purchaseId: string;
  /** The merchant's own shipment identifier, or one the adapter synthesised. */
  sourceShipmentRef: string | null;
  /** Order within the parent order. Ids are random UUIDs, so this is the only stable ordering. */
  position: number;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  status: ShipmentStatus;
  /** Postage attributable to this delivery, in the order's currency. */
  shippingCents: number;
  createdAt: string;
  updatedAt: string;
}

/** One line of an order. */
export interface PurchaseItem {
  id: string;
  purchaseId: string;
  /** The delivery that brought it. Null for digital, unshipped or unassigned lines. */
  shipmentId: string | null;
  /** The line's position in the source document, so a receipt reads back in printed order. */
  position: number;
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
  /** Share of order- and delivery-level postage pushed down onto this line. */
  allocatedShippingCents: number;
  /** Signed share of order-level tax and discount not already inside the line total. */
  allocatedAdjustmentCents: number;
  /** The merchant's own category string, verbatim. Not a POPS tag. */
  merchantCategory: string | null;
  kind: ItemKind | null;
  createdAt: string;
}

/** One physical unit of a line, where that unit has its own identity. */
export interface PurchaseItemUnit {
  id: string;
  itemId: string;
  serialNumber: string | null;
  /** Soft `pops://` reference to the inventory item this unit became. */
  inventoryItemUri: string | null;
  inventoryItemStaleAt: string | null;
  createdAt: string;
}

/**
 * A charge against an order.
 *
 * Exists whether or not `finance` has imported the transaction that proves
 * it — see {@link PurchaseChargeLink}.
 */
export interface PurchaseCharge {
  id: string;
  purchaseId: string;
  /** The delivery this charge is attributable to, when known. Often null. */
  shipmentId: string | null;
  sourceChargeRef: string | null;
  /** Order within the parent order. Ids are random UUIDs, so this is the only stable ordering. */
  position: number;
  /** Signed integer cents in {@link currency}. Negative for a refund. */
  amountCents: number;
  /** ISO 4217 the charge settles in — the account's currency. */
  currency: string;
  /** The same money in the ORDER's currency, which is what the residual is computed in. */
  orderAmountCents: number;
  chargedAt: string | null;
  role: SettlementRole;
  paymentHint: string | null;
  origin: ChargeOrigin;
  createdAt: string;
  updatedAt: string;
}

/**
 * A charge matched to a finance transaction.
 *
 * `confirmedAt === null` means the engine derived it and a sweep may tear
 * it down and re-derive it. Non-null means a human pinned it.
 */
export interface PurchaseChargeLink {
  id: string;
  chargeId: string;
  /** `pops://finance/transaction/<id>`. A soft URI, not a foreign key. */
  transactionUri: string;
  amountCents: number;
  linkType: LinkType;
  confidence: number;
  matchRuleId: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

/** How much of a charge paid for one line. */
export interface PurchaseItemAllocation {
  id: string;
  chargeId: string;
  itemId: string;
  /** Signed integer cents in the order's currency. */
  amountCents: number;
  createdAt: string;
}

/** Evidence for an order or one of its deliveries. */
export interface PurchaseDocument {
  id: string;
  purchaseId: string;
  shipmentId: string | null;
  /** Soft `pops://documents/document/<id>` reference. */
  documentUri: string;
  documentStaleAt: string | null;
  kind: DocumentKind;
  createdAt: string;
}

/**
 * How much of an order's total is explained, and by what.
 *
 * Three numbers rather than one because they call for different actions:
 * {@link matchedCents} is done, {@link awaitingImportCents} is a wait, and
 * only {@link residualCents} is a question for a human.
 */
export interface PurchaseAccounting {
  totalCents: number;
  /** Charged and backed by at least one finance transaction. Refunds excluded. */
  matchedCents: number;
  /** Charged, but no transaction has landed yet. Not a problem. */
  awaitingImportCents: number;
  /**
   * Money no charge accounts for: gift cards, rewards, genuine misses.
   * Never clamped — negative means over-charged, which is a bug to surface.
   */
  residualCents: number;
  /**
   * Magnitude of money returned. Positive, and deliberately NOT subtracted
   * from the three above: a refund is not an unexplained gap, and folding
   * it in made getting a refund raise the "something is wrong" number.
   */
  refundedCents: number;
  /**
   * `totalCents − refundedCents`. What the order actually cost, independent
   * of how much of it can be proven through the bank. Signed and unclamped:
   * negative means refunds exceeded the total, a genuine over-refund.
   */
  netSpendCents: number;
}

/**
 * View types for one order, typed locally for the playground and mirroring
 * the shape `GET /purchases/{id}` answers with in `pillars/purchases/app/src/pages/purchase-detail/types.ts`.
 * Not imported from the app — the playground fixture is the source of truth
 * here, and a field the server stops sending should not silently vanish from
 * these.
 */

export type PurchaseStatus =
  | 'awaiting_settlement'
  | 'linked'
  | 'partial'
  | 'settled_cash'
  | 'ignored';

export type IngestMethod = 'email' | 'export' | 'upload' | 'manual';

export type SettlementMode = 'card' | 'cash' | 'unknown';

export type ItemKind = 'consumable' | 'durable' | 'digital' | 'service';

/** The namespace a line's product identifier lives in. */
export type SkuScheme = 'asin' | 'merchant';

export type ChargeRole = 'capture' | 'authorization' | 'refund' | 'adjustment';

export type ChargeOrigin = 'merchant' | 'derived';

export type LinkType = 'exact' | 'split' | 'combined' | 'partial' | 'rule' | 'manual';

export type ShipmentStatus = 'pending' | 'shipped' | 'delivered' | 'cancelled' | 'returned';

export type DocumentKind =
  | 'tax_invoice'
  | 'receipt'
  | 'order_confirmation'
  | 'delivery_photo'
  | 'other';

/** The order row itself — identity, money as the merchant stated it, status. */
export interface OrderPurchase {
  id: string;
  merchantEntityName: string | null;
  merchantEntityId: string | null;
  totalCents: number;
  currency: string;
  source: string;
  sourceOrderId: string | null;
  orderedAt: string | null;
  status: PurchaseStatus;
  ingestMethod: IngestMethod;
  settlementMode: SettlementMode;
  paymentHint: string | null;
}

/** The order's own reconciliation split, computed by the pillar. */
export interface OrderAccounting {
  totalCents: number;
  matchedCents: number;
  awaitingImportCents: number;
  residualCents: number;
  refundedCents: number;
  netSpendCents: number;
}

export interface OrderLineTag {
  tag: string;
  confirmedAt: string | null;
}

export interface OrderLineUnit {
  id: string;
  serialNumber: string | null;
  /** A soft cross-pillar reference into inventory, shown as the URI it is. */
  inventoryItemUri: string | null;
}

export interface OrderLineSku {
  scheme: SkuScheme;
  value: string;
}

export interface OrderLineItem {
  id: string;
  name: string;
  sku: OrderLineSku | null;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  refundedCents: number;
  kind: { value: ItemKind } | null;
}

/** One line, with its tags, units, notes and landed cost. */
export interface OrderLine {
  item: OrderLineItem;
  landedCostCents: number;
  tags: OrderLineTag[];
  units: OrderLineUnit[];
  notes: string[];
}

/** One transaction link hanging off a charge. */
export interface ChargeLink {
  id: string;
  linkType: LinkType;
  confidence: number;
  confirmedAt: string | null;
  /** A soft `pops://` reference into finance, shown as the URI it is. */
  transactionUri: string;
  amountCents: number;
}

export interface ChargeAllocation {
  id: string;
}

export interface Charge {
  id: string;
  role: ChargeRole;
  origin: ChargeOrigin;
  amountCents: number;
  currency: string;
  chargedAt: string | null;
  paymentHint: string | null;
}

/** One charge, with what it was allocated to and what it is linked to. */
export interface OrderCharge {
  charge: Charge;
  links: ChargeLink[];
  allocations: ChargeAllocation[];
}

export interface OrderShipment {
  id: string;
  status: ShipmentStatus;
  shippingCents: number;
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface OrderDocument {
  id: string;
  kind: DocumentKind;
  /** A soft `pops://` reference into documents, shown as the URI it is. */
  documentUri: string;
  documentStaleAt: string | null;
}

/** Everything `GET /purchases/{id}` answers with. */
export interface PurchaseOrderDetail {
  purchase: OrderPurchase;
  accounting: OrderAccounting;
  items: OrderLine[];
  charges: OrderCharge[];
  shipments: OrderShipment[];
  documents: OrderDocument[];
  tags: string[];
}

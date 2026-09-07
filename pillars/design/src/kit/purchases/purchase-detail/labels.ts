/**
 * The order-detail vocabulary, copied verbatim from `purchase.*` in
 * `libs/locales/en-AU/purchases.json`. Keyed by the enum so a variant added
 * to the fixture types fails to compile here rather than printing a raw
 * enum token on screen.
 */
import type {
  ChargeOrigin,
  ChargeRole,
  DocumentKind,
  IngestMethod,
  ItemKind,
  LinkType,
  PurchaseStatus,
  SettlementMode,
  ShipmentStatus,
} from '@/fixtures/purchases-order-types';

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  awaiting_settlement: 'Awaiting settlement',
  linked: 'Linked',
  partial: 'Partly linked',
  settled_cash: 'Settled in cash',
  ignored: 'Ignored',
};

export const INGEST_METHOD_LABELS: Record<IngestMethod, string> = {
  email: 'Email',
  export: 'Merchant export',
  upload: 'Upload',
  manual: 'Entered by hand',
};

export const SETTLEMENT_MODE_LABELS: Record<SettlementMode, string> = {
  card: 'Card',
  cash: 'Cash',
  unknown: 'Unknown',
};

export const ITEM_KIND_LABELS: Record<ItemKind, string> = {
  consumable: 'Consumable',
  durable: 'Durable',
  digital: 'Digital',
  service: 'Service',
};

export const CHARGE_ROLE_LABELS: Record<ChargeRole, string> = {
  capture: 'Capture',
  authorization: 'Authorisation',
  refund: 'Refund',
  adjustment: 'Adjustment',
};

export const CHARGE_ORIGIN_LABELS: Record<ChargeOrigin, string> = {
  merchant: 'stated by the merchant',
  derived: 'derived by the pillar',
};

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  exact: 'Exact',
  split: 'Split',
  combined: 'Combined',
  partial: 'Partial',
  rule: 'Rule',
  manual: 'Manual',
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  pending: 'Pending',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  tax_invoice: 'Tax invoice',
  receipt: 'Receipt',
  order_confirmation: 'Order confirmation',
  delivery_photo: 'Delivery photo',
  other: 'Other',
};

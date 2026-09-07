import type { LinkType, PurchaseStatus } from '@/fixtures/purchases-vocabulary';

/** What each order status is called, wherever an order is listed. */
export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  awaiting_settlement: 'Awaiting settlement',
  linked: 'Linked',
  partial: 'Partly linked',
  settled_cash: 'Settled in cash',
  ignored: 'Ignored',
};

/** What each link type is called, on a queue row and on an order alike. */
export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  exact: 'Exact',
  split: 'Split',
  combined: 'Combined',
  partial: 'Partial',
  rule: 'Rule',
  manual: 'Manual',
};

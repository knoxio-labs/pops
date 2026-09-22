import { ORDER, PURCHASE } from './order';

import type { PurchaseListResponses } from '../../purchases-api/types.gen';

/** The order index row for the same order, as `GET /purchases` returns it. */
export const ORDER_INDEX_ROW: PurchaseListResponses[200]['items'][number] = {
  checksum: PURCHASE.checksum,
  createdAt: PURCHASE.createdAt,
  currency: PURCHASE.currency,
  discountCents: PURCHASE.discountCents,
  discountIncluded: PURCHASE.discountIncluded,
  id: PURCHASE.id,
  ingestMethod: PURCHASE.ingestMethod,
  itemCount: ORDER.items.length,
  merchantEntityId: PURCHASE.merchantEntityId,
  merchantEntityName: PURCHASE.merchantEntityName,
  orderedAt: PURCHASE.orderedAt,
  orderedAtOffsetMinutes: PURCHASE.orderedAtOffsetMinutes,
  paymentHint: PURCHASE.paymentHint,
  rawRef: PURCHASE.rawRef,
  receiptUri: null,
  settlementMode: PURCHASE.settlementMode,
  shippingCents: PURCHASE.shippingCents,
  shippingIncluded: PURCHASE.shippingIncluded,
  source: PURCHASE.source,
  sourceOrderId: PURCHASE.sourceOrderId,
  status: PURCHASE.status,
  subtotalCents: PURCHASE.subtotalCents,
  surchargeCents: PURCHASE.surchargeCents,
  surchargeIncluded: PURCHASE.surchargeIncluded,
  taxCents: PURCHASE.taxCents,
  taxIncluded: PURCHASE.taxIncluded,
  totalCents: PURCHASE.totalCents,
  updatedAt: PURCHASE.updatedAt,
};

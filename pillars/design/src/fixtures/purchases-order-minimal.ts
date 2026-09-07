/**
 * The smallest order the detail screen has to render well: one line, no
 * shipment, no document, nothing awaiting settlement. Line total equals the
 * order total (450 = 450) and the accounting split is fully matched.
 */
import type { PurchaseOrderDetail } from './purchases-order-types';

export const minimalPurchaseOrder: PurchaseOrderDetail = {
  purchase: {
    id: 'pur_01HZY3B9K1M4D6P8SXV2QC',
    merchantEntityName: 'Sample Coffee',
    merchantEntityId: null,
    totalCents: 450,
    currency: 'AUD',
    source: 'manual',
    sourceOrderId: null,
    orderedAt: '2026-08-27T07:12:00Z',
    status: 'settled_cash',
    ingestMethod: 'manual',
    settlementMode: 'cash',
    paymentHint: null,
  },
  accounting: {
    totalCents: 450,
    matchedCents: 0,
    awaitingImportCents: 0,
    residualCents: 450,
    refundedCents: 0,
    netSpendCents: 450,
  },
  items: [
    {
      item: {
        id: 'item_1B9K4D6P8SXV2QCM',
        name: 'Flat White',
        sku: null,
        quantity: 1,
        unitPriceCents: 450,
        lineTotalCents: 450,
        refundedCents: 0,
        kind: { value: 'consumable' },
      },
      landedCostCents: 450,
      tags: [],
      units: [],
      notes: [],
    },
  ],
  charges: [],
  shipments: [],
  documents: [],
  tags: [],
};

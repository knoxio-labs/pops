/**
 * One whole fictional order — the fixture behind `screens/purchases/purchase.tsx`.
 *
 * The arithmetic holds, because this screen puts the lines, the charges and
 * the accounting split on the same page and a reviewer reads them against
 * each other: the three line totals plus the one shipment's cost equal the
 * order total (15900 + 2400 + 2550 + 599 = 21449); the capture charge equals
 * the order total; the refund charge equals the refunded line's
 * `refundedCents`; and `accounting.netSpendCents` is `totalCents -
 * refundedCents`.
 *
 * `landedCostCents` also sums to the order total: the $5.99 shipping charge
 * is allocated across the three lines in proportion to each line's own
 * `lineTotalCents` (456 / 68 / 75 cents), floored per line with the 2-cent
 * rounding remainder given to the last line, so the split is both
 * proportional and exhaustive rather than leaving cents unaccounted for.
 */
import type { PurchaseOrderDetail } from './purchases-order-types';

/** The line a search hit would have landed on — used by the highlighted state. */
export const HIGHLIGHTED_ITEM_ID = 'item_2QK8X1WM9V3NRD5T';

export const purchaseOrder: PurchaseOrderDetail = {
  purchase: {
    id: 'pur_01HZXW7QK3M9D2VN5R8TFC',
    merchantEntityName: 'Bunnings Warehouse',
    merchantEntityId: 'ent_4B7K2Q9XW3M6VNDP',
    totalCents: 21449,
    currency: 'AUD',
    source: 'email',
    sourceOrderId: 'BW-2026-0081423',
    orderedAt: '2026-08-20T14:31:00Z',
    status: 'linked',
    ingestMethod: 'email',
    settlementMode: 'card',
    paymentHint: 'Visa •••• 4471',
  },
  accounting: {
    totalCents: 21449,
    matchedCents: 21449,
    awaitingImportCents: 0,
    residualCents: 0,
    refundedCents: 850,
    netSpendCents: 20599,
  },
  items: [
    {
      item: {
        id: 'item_9F3KQ2XW7M1VND5R',
        name: 'Cordless Drill Kit 18V',
        sku: { scheme: 'merchant', value: 'BW-88213' },
        quantity: 1,
        unitPriceCents: 15900,
        lineTotalCents: 15900,
        refundedCents: 0,
        kind: { value: 'durable' },
      },
      landedCostCents: 16356,
      tags: [{ tag: 'power-tools', confirmedAt: '2026-08-20T18:00:00Z' }],
      units: [{ id: 'unit_1', serialNumber: 'DRL-88213-0042', inventoryItemUri: null }],
      notes: [],
    },
    {
      item: {
        id: HIGHLIGHTED_ITEM_ID,
        name: 'Safety Glasses (Clear)',
        sku: null,
        quantity: 2,
        unitPriceCents: 1200,
        lineTotalCents: 2400,
        refundedCents: 0,
        kind: null,
      },
      landedCostCents: 2468,
      tags: [],
      units: [],
      notes: ['Bought as a pair for shared workshop use.'],
    },
    {
      item: {
        id: 'item_7M1VNDK9X2QW3R5T',
        name: 'Wood Screws Pack (8g x 40mm)',
        sku: { scheme: 'merchant', value: 'BW-40021' },
        quantity: 3,
        unitPriceCents: 850,
        lineTotalCents: 2550,
        refundedCents: 850,
        kind: { value: 'consumable' },
      },
      landedCostCents: 2625,
      tags: [{ tag: 'hardware', confirmedAt: null }],
      units: [],
      notes: [],
    },
  ],
  charges: [
    {
      charge: {
        id: 'charge_4Q1LK8X2VNM9WR',
        role: 'capture',
        origin: 'merchant',
        amountCents: 21449,
        currency: 'AUD',
        chargedAt: '2026-08-20T14:32:00Z',
        paymentHint: 'Visa •••• 4471',
      },
      links: [
        {
          id: 'link_1',
          linkType: 'exact',
          confidence: 0.98,
          confirmedAt: '2026-08-21T09:00:00Z',
          transactionUri: 'pops://finance/transaction/txn_9F2KQ8XW3MND',
          amountCents: 21449,
        },
      ],
      allocations: [{ id: 'alloc_1' }, { id: 'alloc_2' }, { id: 'alloc_3' }],
    },
    {
      charge: {
        id: 'charge_7Q1LK2X9VNM3WR',
        role: 'refund',
        origin: 'derived',
        amountCents: 850,
        currency: 'AUD',
        chargedAt: '2026-08-25T11:15:00Z',
        paymentHint: null,
      },
      links: [
        {
          id: 'link_2',
          linkType: 'partial',
          confidence: 0.62,
          confirmedAt: null,
          transactionUri: 'pops://finance/transaction/txn_7Q1LK2X9VNM3',
          amountCents: 850,
        },
      ],
      allocations: [{ id: 'alloc_4' }],
    },
  ],
  shipments: [
    {
      id: 'ship_1',
      status: 'delivered',
      shippingCents: 599,
      carrier: 'Australia Post',
      trackingNumber: '36QT00021458AU',
      shippedAt: '2026-08-21T08:00:00Z',
      deliveredAt: '2026-08-23T15:40:00Z',
    },
  ],
  documents: [
    {
      id: 'doc_1',
      kind: 'tax_invoice',
      documentUri: 'pops://documents/doc/inv_4471',
      documentStaleAt: null,
    },
    {
      id: 'doc_2',
      kind: 'delivery_photo',
      documentUri: 'pops://documents/doc/photo_88b2',
      documentStaleAt: '2026-08-24T00:00:00Z',
    },
  ],
  tags: ['power-tools', 'home-improvement', 'warranty-registered'],
};

import type { PurchaseGetResponses } from '../../purchases-api/types.gen';

/**
 * One fictional order, whole, and the index row that stands for it.
 *
 * Fictional throughout, following the convention in `pillars/design/src/
 * fixtures/`: no live ids, no real merchant's real order. It is deliberately
 * not the simplest order that would typecheck — the detail page's whole job is
 * to render an order's parts against each other, so the fixture has a shipment
 * that arrived, a charge that settled, a line with a tag and a serial, and a
 * residual the accounting block has to explain. An order with one line and no
 * charges renders a page that looks fine and proves nothing.
 */

const ORDERED_AT = '2026-08-14T03:12:00.000Z';
const CREATED_AT = '2026-08-14T03:12:41.000Z';

export const ORDER_ID = 'pur_9f2c41ab';

export const PURCHASE: PurchaseGetResponses[200]['purchase'] = {
  checksum: 'sha256:6f1e9ac0standalone',
  createdAt: CREATED_AT,
  currency: 'AUD',
  discountCents: 500,
  id: ORDER_ID,
  ingestMethod: 'email',
  merchantEntityId: 'ent_hardware_barn',
  merchantEntityName: 'Hardware Barn',
  orderedAt: ORDERED_AT,
  orderedAtOffsetMinutes: 600,
  paymentHint: 'card ending 4417',
  rawRef: 'HB-2026-114872',
  settlementMode: 'card',
  shippingCents: 1195,
  source: 'hardware-barn',
  sourceOrderId: 'HB-2026-114872',
  status: 'partial',
  subtotalCents: 18400,
  surchargeCents: 0,
  taxCents: 1959,
  totalCents: 21054,
  updatedAt: CREATED_AT,
};

/**
 * Matched against one transaction and short by the shipping, so the accounting
 * block has a residual to name rather than the all-explained case that hides
 * whether it can.
 */
const ACCOUNTING: PurchaseGetResponses[200]['accounting'] = {
  awaitingImportCents: 1195,
  matchedCents: 19859,
  netSpendCents: 21054,
  refundedCents: 0,
  residualCents: 1195,
  totalCents: 21054,
};

export const ORDER: PurchaseGetResponses[200] = {
  accounting: ACCOUNTING,
  purchase: PURCHASE,
  charges: [
    {
      charge: {
        amountCents: 19859,
        chargedAt: '2026-08-14T03:13:02.000Z',
        createdAt: CREATED_AT,
        currency: 'AUD',
        id: 'chg_4a17',
        orderAmountCents: 21054,
        origin: 'merchant',
        paymentHint: 'card ending 4417',
        position: 0,
        purchaseId: ORDER_ID,
        role: 'capture',
        shipmentId: 'shp_1',
        sourceChargeRef: 'HB-CAP-1',
        updatedAt: CREATED_AT,
      },
      allocations: [
        {
          amountCents: 12900,
          chargeId: 'chg_4a17',
          createdAt: CREATED_AT,
          id: 'alc_1',
          itemId: 'itm_drill',
        },
      ],
      links: [
        {
          amountCents: 19859,
          chargeId: 'chg_4a17',
          confidence: 0.98,
          confirmedAt: '2026-08-15T22:04:00.000Z',
          createdAt: '2026-08-15T22:03:55.000Z',
          id: 'lnk_1',
          linkType: 'exact',
          matchRuleId: 'rule_hardware_barn',
          transactionUri: 'pops://finance/transaction/txn_5512',
        },
      ],
    },
  ],
  items: [
    {
      item: {
        allocatedAdjustmentCents: -500,
        allocatedShippingCents: 900,
        createdAt: CREATED_AT,
        gstApplicable: true,
        id: 'itm_drill',
        imageUrl: null,
        kind: { confirmedAt: '2026-08-16T01:00:00.000Z', value: 'durable' },
        lineTotalCents: 12900,
        merchantCategory: 'Power tools',
        merchantCondition: 'New',
        name: 'Cordless hammer drill, 18V',
        position: 0,
        promotionalPrice: false,
        purchaseId: ORDER_ID,
        quantity: 1,
        refundedCents: 0,
        shipmentId: 'shp_1',
        sku: { scheme: 'merchant', value: 'HB-DRL-18V' },
        unitPriceCents: 12900,
        url: null,
      },
      landedCostCents: 13300,
      notes: ['Serial recorded at unboxing.'],
      tags: [{ confirmedAt: '2026-08-16T01:00:00.000Z', tag: 'workshop' }],
      units: [
        {
          createdAt: CREATED_AT,
          id: 'unt_1',
          inventoryDeclinedAt: null,
          inventoryItemStaleAt: null,
          inventoryItemUri: 'pops://inventory/item/inv_8841',
          itemId: 'itm_drill',
          serialNumber: 'HB18V-004182',
        },
      ],
    },
    {
      item: {
        allocatedAdjustmentCents: 0,
        allocatedShippingCents: 295,
        createdAt: CREATED_AT,
        gstApplicable: true,
        id: 'itm_bits',
        imageUrl: null,
        kind: { confirmedAt: null, value: 'consumable' },
        lineTotalCents: 5500,
        merchantCategory: 'Accessories',
        merchantCondition: null,
        name: 'Masonry bit set, 10 piece',
        position: 1,
        promotionalPrice: true,
        purchaseId: ORDER_ID,
        quantity: 2,
        refundedCents: 0,
        shipmentId: 'shp_1',
        sku: null,
        unitPriceCents: 2750,
        url: null,
      },
      landedCostCents: 5795,
      notes: [],
      tags: [{ confirmedAt: null, tag: 'workshop' }],
      units: [],
    },
  ],
  shipments: [
    {
      carrier: 'Southbound Freight',
      createdAt: CREATED_AT,
      deliveredAt: '2026-08-19T04:41:00.000Z',
      id: 'shp_1',
      position: 0,
      purchaseId: ORDER_ID,
      shippedAt: '2026-08-15T06:20:00.000Z',
      shippingCents: 1195,
      sourceShipmentRef: 'HB-SHP-1',
      status: 'delivered',
      trackingNumber: 'SBF7712004182',
      updatedAt: '2026-08-19T04:41:00.000Z',
    },
  ],
  documents: [
    {
      createdAt: CREATED_AT,
      documentStaleAt: null,
      documentUri: 'pops://documents/document/doc_2231',
      id: 'pdc_1',
      kind: 'tax_invoice',
      purchaseId: ORDER_ID,
      shipmentId: null,
    },
  ],
  tags: ['workshop'],
};

import { describe, expect, it } from 'vitest';

import { inventoryItemIdOf, purchaseHits, purchaseHref, toPurchaseResult } from './purchase-model';

import type { PurchaseGetResponse } from '../purchases-api/types.gen.js';
import type { PurchasesSearchHit } from './purchase-model';

function hit(uri: string, data: Record<string, unknown>): PurchasesSearchHit {
  return {
    data,
    matchField: 'text',
    matchType: 'contains',
    score: 1,
    uri,
  };
}

function orderData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    currency: 'AUD',
    merchantEntityName: 'Hardware Barn',
    orderedAt: '2026-08-14T03:12:00.000Z',
    source: 'hardware-barn',
    sourceOrderId: 'HB-2026-114872',
    totalCents: 21054,
    ...overrides,
  };
}

function lineData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    currency: 'AUD',
    merchantEntityName: 'Hardware Barn',
    name: 'Cordless hammer drill, 18V',
    orderedAt: '2026-08-14T03:12:00.000Z',
    purchaseId: 'pur_9f2c41ab',
    totalCents: 21054,
    ...overrides,
  };
}

function purchaseDetail(): PurchaseGetResponse {
  return {
    accounting: {
      awaitingImportCents: 0,
      matchedCents: 0,
      netSpendCents: 21054,
      refundedCents: 0,
      residualCents: 0,
      totalCents: 21054,
    },
    charges: [],
    documents: [],
    edit: null,
    items: [
      {
        item: {
          allocatedAdjustmentCents: 0,
          allocatedShippingCents: 0,
          createdAt: '2026-08-14T03:12:41.000Z',
          gstApplicable: true,
          id: 'itm_drill',
          imageUrl: null,
          kind: null,
          lineTotalCents: 12900,
          listPrice: null,
          merchantCategory: null,
          merchantCondition: null,
          name: 'Cordless hammer drill, 18V',
          position: 0,
          promotionalPrice: false,
          purchaseId: 'pur_9f2c41ab',
          quantity: 1,
          refundedCents: 0,
          shipmentId: null,
          sku: null,
          unitPriceCents: 12900,
          url: null,
        },
        landedCostCents: 12900,
        notes: [],
        tags: [],
        units: [
          {
            createdAt: '2026-08-14T03:12:41.000Z',
            id: 'unit-untracked',
            inventoryDeclinedAt: null,
            inventoryItemStaleAt: null,
            inventoryItemUri: null,
            itemId: 'itm_drill',
            serialNumber: null,
          },
          {
            createdAt: '2026-08-14T03:12:41.000Z',
            id: 'unit-tracked',
            inventoryDeclinedAt: null,
            inventoryItemStaleAt: null,
            inventoryItemUri: 'pops://inventory/item/inv_8841',
            itemId: 'itm_drill',
            serialNumber: null,
          },
        ],
      },
      {
        item: {
          allocatedAdjustmentCents: 0,
          allocatedShippingCents: 0,
          createdAt: '2026-08-14T03:12:41.000Z',
          gstApplicable: true,
          id: 'itm_bits',
          imageUrl: null,
          kind: null,
          lineTotalCents: 5500,
          listPrice: null,
          merchantCategory: null,
          merchantCondition: null,
          name: 'Masonry bit set, 10 piece',
          position: 1,
          promotionalPrice: false,
          purchaseId: 'pur_9f2c41ab',
          quantity: 2,
          refundedCents: 0,
          shipmentId: null,
          sku: null,
          unitPriceCents: 2750,
          url: null,
        },
        landedCostCents: 5500,
        notes: [],
        tags: [],
        units: [],
      },
    ],
    purchase: {
      checksum: 'sha256:test',
      createdAt: '2026-08-14T03:12:41.000Z',
      currency: 'AUD',
      discountCents: 0,
      discountIncluded: null,
      id: 'pur_9f2c41ab',
      ingestMethod: 'manual',
      merchantAddressId: null,
      merchantAddressName: null,
      merchantEntityId: 'ent_hardware_barn',
      merchantEntityName: 'Hardware Barn',
      orderedAt: '2026-08-14T03:12:00.000Z',
      orderedAtOffsetMinutes: 600,
      paymentHint: null,
      rawRef: null,
      settlementMode: 'card',
      shippingCents: 0,
      shippingIncluded: null,
      source: 'hardware-barn',
      sourceOrderId: 'HB-2026-114872',
      status: 'linked',
      subtotalCents: 18400,
      surchargeCents: 0,
      surchargeIncluded: null,
      taxCents: 2654,
      taxIncluded: null,
      totalCents: 21054,
      updatedAt: '2026-08-14T03:12:41.000Z',
    },
    shipments: [],
    tags: [],
  };
}

describe('purchaseHits', () => {
  it('groups order and line hits by purchase in first-hit order', () => {
    expect(
      purchaseHits([
        hit('pops:purchases/purchase-item/line-b', lineData({ purchaseId: 'purchase-b' })),
        hit('pops:purchases/purchase/purchase-a', orderData({ sourceOrderId: 'A-1' })),
      ])
    ).toEqual([
      {
        id: 'purchase-b',
        merchant: 'Hardware Barn',
        orderNumber: null,
        date: '2026-08-14T03:12:00.000Z',
        totalCents: 21054,
        currency: 'AUD',
        matchedLine: 'Cordless hammer drill, 18V',
      },
      {
        id: 'purchase-a',
        merchant: 'Hardware Barn',
        orderNumber: 'A-1',
        date: '2026-08-14T03:12:00.000Z',
        totalCents: 21054,
        currency: 'AUD',
        matchedLine: null,
      },
    ]);
  });

  it('an order hit wins over line hits for the same purchase and keeps the first matched line', () => {
    expect(
      purchaseHits([
        hit(
          'pops:purchases/purchase-item/line-1',
          lineData({ name: 'Cable', merchantEntityName: 'Line Merchant' })
        ),
        hit('pops:purchases/purchase-item/line-2', lineData({ name: 'Adapter' })),
        hit(
          'pops:purchases/purchase/pur_9f2c41ab',
          orderData({ sourceOrderId: 'ORDER-1', totalCents: 2500 })
        ),
      ])
    ).toEqual([
      {
        id: 'pur_9f2c41ab',
        merchant: 'Hardware Barn',
        orderNumber: 'ORDER-1',
        date: '2026-08-14T03:12:00.000Z',
        totalCents: 2500,
        currency: 'AUD',
        matchedLine: 'Cable',
      },
    ]);
  });

  it('an order hit without a merchant name uses its source', () => {
    expect(
      purchaseHits([
        hit(
          'pops:purchases/purchase/pur_9f2c41ab',
          orderData({ merchantEntityName: null, source: 'amazon-au' })
        ),
      ])
    ).toEqual([expect.objectContaining({ id: 'pur_9f2c41ab', merchant: 'amazon-au' })]);
  });

  it('ignores hits of other kinds and hits missing a needed field', () => {
    expect(
      purchaseHits([
        hit('pops:inventory/item/item-1', orderData()),
        hit('pops:purchases/purchase/pur-missing-date', orderData({ orderedAt: undefined })),
        hit('pops:purchases/purchase-item/line-wrong-name', lineData({ name: 42 })),
      ])
    ).toEqual([]);
  });
});

describe('toPurchaseResult', () => {
  it('maps a purchase detail to its lines with the inventory item a unit became', () => {
    expect(toPurchaseResult(purchaseDetail())).toEqual({
      id: 'pur_9f2c41ab',
      merchant: 'Hardware Barn',
      orderNumber: 'HB-2026-114872',
      date: '2026-08-14T03:12:00.000Z',
      totalCents: 21054,
      lines: [
        {
          name: 'Cordless hammer drill, 18V',
          quantity: 1,
          priceCents: 12900,
          itemId: 'inv_8841',
        },
        { name: 'Masonry bit set, 10 piece', quantity: 2, priceCents: 2750 },
      ],
    });
  });
});

describe('inventoryItemIdOf', () => {
  it('accepts only pops://inventory/item/<id>', () => {
    expect(inventoryItemIdOf('pops://inventory/item/inv_8841')).toBe('inv_8841');
    expect(inventoryItemIdOf('pops://inventory/item/')).toBeNull();
    expect(inventoryItemIdOf('pops://inventory/item/inv/child')).toBeNull();
    expect(inventoryItemIdOf('pops://purchases/item/inv_8841')).toBeNull();
    expect(inventoryItemIdOf('pops://inventory/item/inv 8841')).toBeNull();
    expect(inventoryItemIdOf(null)).toBeNull();
  });
});

describe('purchaseHref', () => {
  it('points to the purchases app purchase page', () => {
    expect(purchaseHref('po-1')).toBe('/purchases/po-1');
  });
});

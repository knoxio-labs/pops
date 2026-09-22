/**
 * `toPurchaseItemBody`'s list-price fusion (POPS-3652), on the same pattern
 * `kind`/`kindConfirmedAt` already sets: a value never reaches the wire
 * without the marker that says whether to trust it.
 */
import { describe, expect, it } from 'vitest';

import { toPurchaseItemBody } from '../serializers.js';

import type { PurchaseItemRow } from '../../../db/schema.js';

const BASE_ROW: PurchaseItemRow = {
  id: 'item-1',
  purchaseId: 'purchase-1',
  shipmentId: null,
  position: 0,
  name: 'Bolt M8',
  sku: null,
  skuScheme: null,
  url: null,
  imageUrl: null,
  quantity: 1,
  unitPriceCents: 350,
  lineTotalCents: 350,
  refundedCents: 0,
  allocatedShippingCents: 0,
  allocatedAdjustmentCents: 0,
  listPriceCents: null,
  listPriceConfirmedAt: null,
  merchantCategory: null,
  merchantCondition: null,
  promotionalPrice: null,
  gstApplicable: null,
  kind: null,
  kindConfirmedAt: null,
  createdAt: '2026-08-12T00:00:00.000Z',
};

describe('toPurchaseItemBody — list price', () => {
  it('fuses a stored list price with its confirmation', () => {
    const body = toPurchaseItemBody({
      ...BASE_ROW,
      listPriceCents: 550,
      listPriceConfirmedAt: null,
    });
    expect(body.listPrice).toEqual({ valueCents: 550, confirmedAt: null });
  });

  it('carries a confirmed list price through', () => {
    const body = toPurchaseItemBody({
      ...BASE_ROW,
      listPriceCents: 550,
      listPriceConfirmedAt: '2026-08-12T00:00:00.000Z',
    });
    expect(body.listPrice).toEqual({ valueCents: 550, confirmedAt: '2026-08-12T00:00:00.000Z' });
  });

  it('is null when no list price was ever stated', () => {
    const body = toPurchaseItemBody(BASE_ROW);
    expect(body.listPrice).toBeNull();
  });
});

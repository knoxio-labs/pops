/**
 * The merchant-identity mapping at the wire boundary (POPS-3634/POPS-3840):
 * `toMobilePurchase`/`toMobilePurchaseDetail` turning `merchantEntityId` +
 * `merchantEntityName` + a batched contacts lookup into the three-way
 * `merchant` field. `mobile-purchases-read.test.ts` drives the same mapping
 * end to end through the real app; this file is the mapping alone, isolated
 * from the HTTP layer and the gateway.
 */
import { describe, expect, it } from 'vitest';

import {
  PurchasesDetailResponseSchema,
  PurchasesListRowSchema,
  toMobilePurchase,
  toMobilePurchaseDetail,
} from '../list-wire.js';

import type { PurchasesDetailResponse, PurchasesListRow } from '../list-wire.js';

const BASE_ROW: PurchasesListRow = {
  id: 'pur-1',
  source: 'receipt',
  merchantEntityId: null,
  merchantEntityName: null,
  totalCents: 100,
  currency: 'AUD',
  orderedAt: '2026-08-13T02:15:00.000Z',
  orderedAtOffsetMinutes: 600,
  status: 'awaiting_settlement',
  itemCount: 1,
  receiptUri: null,
};

const BASE_DETAIL: PurchasesDetailResponse = {
  purchase: {
    id: 'pur-1',
    source: 'receipt',
    merchantEntityId: null,
    merchantEntityName: null,
    totalCents: 100,
    subtotalCents: 100,
    taxCents: 0,
    shippingCents: 0,
    discountCents: 0,
    surchargeCents: 0,
    currency: 'AUD',
    orderedAt: '2026-08-13T02:15:00.000Z',
    orderedAtOffsetMinutes: 600,
    status: 'awaiting_settlement',
  },
  items: [],
  documents: [],
};

describe('toMobilePurchase merchant identity', () => {
  it('resolves to entity, naming it from the batched lookup', () => {
    const row: PurchasesListRow = {
      ...BASE_ROW,
      merchantEntityId: 'ent-1',
      merchantEntityName: 'K mart',
    };
    const mergedNames = new Map([['ent-1', 'Kmart']]);

    const mobile = toMobilePurchase(row, mergedNames);

    expect(mobile.merchant).toEqual({ resolution: 'entity', entityId: 'ent-1', name: 'Kmart' });
    // The till's own wording survives on the deprecated field regardless.
    expect(mobile.merchantName).toBe('K mart');
  });

  it('resolves to entity with a null name when the lookup did not name it', () => {
    const row: PurchasesListRow = {
      ...BASE_ROW,
      merchantEntityId: 'ent-1',
      merchantEntityName: 'K mart',
    };

    const mobile = toMobilePurchase(row, new Map());

    expect(mobile.merchant).toEqual({ resolution: 'entity', entityId: 'ent-1', name: null });
  });

  it('resolves to the printed name when no entity is attached', () => {
    const row: PurchasesListRow = { ...BASE_ROW, merchantEntityName: 'Bunnings Warehouse' };

    const mobile = toMobilePurchase(row, new Map());

    expect(mobile.merchant).toEqual({ resolution: 'name', name: 'Bunnings Warehouse' });
  });

  it('is unattributed when the order names no merchant at all', () => {
    const mobile = toMobilePurchase(BASE_ROW, new Map());

    expect(mobile.merchant).toEqual({ resolution: 'unattributed' });
  });

  it('treats a blank printed name the same as no name', () => {
    const row: PurchasesListRow = { ...BASE_ROW, merchantEntityName: '   ' };

    const mobile = toMobilePurchase(row, new Map());

    expect(mobile.merchant).toEqual({ resolution: 'unattributed' });
  });

  it('an entity id present with an unrelated lookup entry still resolves to entity, unnamed', () => {
    const row: PurchasesListRow = { ...BASE_ROW, merchantEntityId: 'ent-1' };
    const mergedNames = new Map([['ent-2', 'Somebody Else']]);

    const mobile = toMobilePurchase(row, mergedNames);

    expect(mobile.merchant).toEqual({ resolution: 'entity', entityId: 'ent-1', name: null });
  });
});

describe('merchantEntityId absent, not just null (POPS-3634 regression)', () => {
  // The stub bfm's iOS UI-flow lane runs against (scripts/ios-e2e/purchases-stub.mjs)
  // answers a manually-created purchase without a `merchantEntityId` key at
  // all, not with an explicit `null` — the same shape an older or partial
  // producer build could send. Requiring the key turned that into a `502`
  // for the whole page; both schemas below have to keep parsing it.
  it('PurchasesListRowSchema accepts a row with no merchantEntityId key', () => {
    const { merchantEntityId: _omitted, ...rowWithoutEntityId } = BASE_ROW;

    const result = PurchasesListRowSchema.safeParse(rowWithoutEntityId);

    expect(result.success).toBe(true);
  });

  it('PurchasesDetailResponseSchema accepts a purchase with no merchantEntityId key', () => {
    const { merchantEntityId: _omitted, ...purchaseWithoutEntityId } = BASE_DETAIL.purchase;

    const result = PurchasesDetailResponseSchema.safeParse({
      ...BASE_DETAIL,
      purchase: purchaseWithoutEntityId,
    });

    expect(result.success).toBe(true);
  });

  it('toMobilePurchase reads an absent merchantEntityId the same as null', () => {
    const { merchantEntityId: _omitted, ...rowWithoutEntityId } = BASE_ROW;
    const parsed = PurchasesListRowSchema.parse({
      ...rowWithoutEntityId,
      merchantEntityName: 'Corner Store',
    });

    const mobile = toMobilePurchase(parsed, new Map());

    expect(mobile.merchant).toEqual({ resolution: 'name', name: 'Corner Store' });
  });
});

describe('toMobilePurchaseDetail merchant identity', () => {
  it('resolves to entity, naming it from the batched lookup', () => {
    const detail: PurchasesDetailResponse = {
      ...BASE_DETAIL,
      purchase: {
        ...BASE_DETAIL.purchase,
        merchantEntityId: 'ent-1',
        merchantEntityName: 'K mart',
      },
    };

    const mobile = toMobilePurchaseDetail(detail, new Map([['ent-1', 'Kmart']]));

    expect(mobile.merchant).toEqual({ resolution: 'entity', entityId: 'ent-1', name: 'Kmart' });
  });

  it('falls back to no merged names at all, defaulting to an empty map', () => {
    const detail: PurchasesDetailResponse = {
      ...BASE_DETAIL,
      purchase: { ...BASE_DETAIL.purchase, merchantEntityName: 'Woolworths' },
    };

    const mobile = toMobilePurchaseDetail(detail);

    expect(mobile.merchant).toEqual({ resolution: 'name', name: 'Woolworths' });
  });

  it('is unattributed when the order names no merchant at all', () => {
    const mobile = toMobilePurchaseDetail(BASE_DETAIL, new Map());

    expect(mobile.merchant).toEqual({ resolution: 'unattributed' });
  });
});

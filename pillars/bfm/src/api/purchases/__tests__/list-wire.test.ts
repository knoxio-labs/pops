/**
 * The merchant-identity mapping at the wire boundary (POPS-3634/POPS-3840):
 * `toMobilePurchase`/`toMobilePurchaseDetail` turning `merchantEntityId` +
 * `merchantEntityName` + a batched contacts lookup into the three-way
 * `merchant` field. `mobile-purchases-read.test.ts` drives the same mapping
 * end to end through the real app; this file is the mapping alone, isolated
 * from the HTTP layer and the gateway.
 */
import { describe, expect, it } from 'vitest';

import { MobilePurchaseItemSchema } from '../../../contract/mobile-purchases-schemas.js';
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
  edit: null,
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
    updatedAt: '2026-08-13T02:15:00.000Z',
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

describe('edit and updatedAt absent, not just null (POPS-2458 regression)', () => {
  // The same stub the merchantEntityId regression above documents answers a
  // manually-created purchase with no `edit` or `updatedAt` key at all — the
  // same shape a `purchases` build that predates the edit feature sends.
  // Requiring either key turned that into a `502` for the whole detail; both
  // now have to keep parsing it, and the mapping has to default them.
  it('PurchasesDetailResponseSchema accepts a detail with no edit key at all', () => {
    const { edit: _omitted, ...detailWithoutEdit } = BASE_DETAIL;

    const result = PurchasesDetailResponseSchema.safeParse(detailWithoutEdit);

    expect(result.success).toBe(true);
  });

  it('PurchasesDetailResponseSchema accepts a purchase with no updatedAt key at all', () => {
    const { updatedAt: _omitted, ...purchaseWithoutUpdatedAt } = BASE_DETAIL.purchase;

    const result = PurchasesDetailResponseSchema.safeParse({
      ...BASE_DETAIL,
      purchase: purchaseWithoutUpdatedAt,
    });

    expect(result.success).toBe(true);
  });

  it('maps an absent edit and an absent updatedAt to null on the mobile wire', () => {
    const { edit: _omittedEdit, purchase, ...rest } = BASE_DETAIL;
    const { updatedAt: _omittedUpdatedAt, ...purchaseWithoutUpdatedAt } = purchase;
    const parsed = PurchasesDetailResponseSchema.parse({
      ...rest,
      purchase: purchaseWithoutUpdatedAt,
    });

    const mobile = toMobilePurchaseDetail(parsed);

    expect(mobile.edit).toBeNull();
    expect(mobile.updatedAt).toBeNull();
  });

  it('still maps an explicit null the same way as absent', () => {
    const mobile = toMobilePurchaseDetail(BASE_DETAIL);

    expect(mobile.edit).toBeNull();
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

describe('purchase line Inventory linkage', () => {
  const line = (
    units?: { inventoryItemUri: string | null; inventoryItemStaleAt?: string | null }[]
  ) => ({
    item: { id: 'line-1', name: 'Drill', quantity: 1, lineTotalCents: 12_500 },
    ...(units === undefined ? {} : { units }),
  });

  it('marks a valid Inventory item URI as linked', () => {
    const mobile = toMobilePurchaseDetail({
      ...BASE_DETAIL,
      items: [line([{ inventoryItemUri: 'pops://inventory/item/inv-1' }])],
    });

    expect(mobile.items[0]?.hasInventoryLink).toBe(true);
  });

  it('leaves a line with no linked unit unlinked', () => {
    const mobile = toMobilePurchaseDetail({ ...BASE_DETAIL, items: [line([])] });

    expect(mobile.items[0]?.hasInventoryLink).toBe(false);
  });

  it('finds a link among multiple units', () => {
    const mobile = toMobilePurchaseDetail({
      ...BASE_DETAIL,
      items: [
        line([{ inventoryItemUri: null }, { inventoryItemUri: 'pops://inventory/item/inv-2' }]),
      ],
    });

    expect(mobile.items[0]?.hasInventoryLink).toBe(true);
  });

  it('keeps a stale-marked valid link because removal still unlinks it', () => {
    const mobile = toMobilePurchaseDetail({
      ...BASE_DETAIL,
      items: [
        line([
          {
            inventoryItemUri: 'pops://inventory/item/inv-stale',
            inventoryItemStaleAt: '2026-09-22T00:00:00.000Z',
          },
        ]),
      ],
    });

    expect(mobile.items[0]?.hasInventoryLink).toBe(true);
  });

  it('does not treat another or malformed URI as an Inventory item link', () => {
    const mobile = toMobilePurchaseDetail({
      ...BASE_DETAIL,
      items: [
        line([
          { inventoryItemUri: 'pops://finance/item/1' },
          { inventoryItemUri: 'inventory/item/1' },
          { inventoryItemUri: 'pops://inventory/item/a/b' },
          { inventoryItemUri: 'pops://inventory/item/a b' },
          { inventoryItemUri: 'pops://inventory/item/' },
        ]),
      ],
    });

    expect(mobile.items[0]?.hasInventoryLink).toBe(false);
  });

  it('accepts a legacy line with no units field and reports no link', () => {
    const parsed = PurchasesDetailResponseSchema.parse({ ...BASE_DETAIL, items: [line()] });
    const mobile = toMobilePurchaseDetail(parsed);

    expect(mobile.items[0]?.hasInventoryLink).toBe(false);
  });

  it('keeps the mobile response field optional for older BFM payloads', () => {
    const parsed = MobilePurchaseItemSchema.safeParse({
      id: 'line-1',
      name: 'Drill',
      quantity: 1,
      lineTotalCents: 12_500,
    });

    expect(parsed.success).toBe(true);
  });
});

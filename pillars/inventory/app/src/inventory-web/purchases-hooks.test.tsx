import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  purchaseGet: vi.fn(),
  purchaseList: vi.fn(),
  searchSearch: vi.fn(),
}));

vi.mock('../purchases-api/index.js', () => ({
  purchaseGet: (...args: unknown[]) => mocks.purchaseGet(...args),
  purchaseList: (...args: unknown[]) => mocks.purchaseList(...args),
  searchSearch: (...args: unknown[]) => mocks.searchSearch(...args),
}));

import { InventoryApiError } from '../inventory-api-helpers';
import { PurchasesApiError } from '../purchases-api-helpers';
import { createTestQueryClient, withQueryClient } from './test-utils';
import { useItemPurchase } from './useItemPurchase';
import { usePurchasePreview } from './usePurchasePreview';
import { PURCHASES_SEARCH_QUERY_KEY, usePurchasesSearch } from './usePurchasesSearch';

import type { PurchaseGetResponse } from '../purchases-api/types.gen.js';
import type { PurchasesSearchHit } from './purchase-model';

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function hit(uri: string, data: Record<string, unknown>): PurchasesSearchHit {
  return {
    data,
    matchField: 'text',
    matchType: 'contains',
    score: 1,
    uri,
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
          purchaseId: 'po-1',
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
            id: 'unit-1',
            inventoryDeclinedAt: null,
            inventoryItemStaleAt: null,
            inventoryItemUri: 'pops://inventory/item/inv-1',
            itemId: 'itm_drill',
            serialNumber: null,
          },
        ],
      },
    ],
    purchase: {
      checksum: 'sha256:test',
      createdAt: '2026-08-14T03:12:41.000Z',
      currency: 'AUD',
      discountCents: 0,
      discountIncluded: null,
      id: 'po-1',
      ingestMethod: 'manual',
      merchantAddressId: null,
      merchantAddressName: null,
      merchantEntityId: 'merchant-1',
      merchantEntityName: 'Hardware Barn',
      orderedAt: '2026-08-14T03:12:00.000Z',
      orderedAtOffsetMinutes: 600,
      paymentHint: null,
      rawRef: null,
      settlementMode: 'card',
      shippingCents: 0,
      shippingIncluded: null,
      source: 'hardware-barn',
      sourceOrderId: 'ORDER-1',
      status: 'linked',
      subtotalCents: 12900,
      surchargeCents: 0,
      surchargeIncluded: null,
      taxCents: 0,
      taxIncluded: null,
      totalCents: 21054,
      updatedAt: '2026-08-14T03:12:41.000Z',
    },
    shipments: [],
    tags: [],
  };
}

function deferred<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error('Promise resolver is not ready');
      resolvePromise(value);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePurchasesSearch', () => {
  it('is idle for a blank query and sends nothing', () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurchasesSearch('   '), {
      wrapper: withQueryClient(client),
    });

    expect(result.current).toEqual({ hits: [], status: 'idle', error: null });
    expect(mocks.searchSearch).not.toHaveBeenCalled();
  });

  it('reports loading while the purchases request is pending', () => {
    const request = deferred<ReturnType<typeof ok<{ hits: PurchasesSearchHit[] }>>>();
    mocks.searchSearch.mockReturnValue(request.promise);
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurchasesSearch('cable'), {
      wrapper: withQueryClient(client),
    });

    expect(result.current.status).toBe('pending');
    expect(mocks.searchSearch).toHaveBeenCalledTimes(1);

    request.resolve(ok({ hits: [] }));
  });

  it('sends the trimmed text without search filters and returns purchase hits', async () => {
    mocks.searchSearch.mockResolvedValue(
      ok({
        hits: [
          hit('pops:purchases/purchase-item/line-1', {
            currency: 'AUD',
            merchantEntityName: null,
            name: 'USB-C cable',
            orderedAt: '2026-08-14T03:12:00.000Z',
            purchaseId: 'po-1',
            totalCents: 2500,
          }),
        ],
      })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurchasesSearch('  cable  '), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(mocks.searchSearch).toHaveBeenCalledWith({
      body: { query: { text: 'cable' } },
    });
    expect(result.current.hits).toEqual([
      {
        id: 'po-1',
        merchant: '',
        orderNumber: null,
        date: '2026-08-14T03:12:00.000Z',
        totalCents: 2500,
        currency: 'AUD',
        matchedLine: 'USB-C cable',
      },
    ]);
    expect(
      client.getQueryCache().find({ queryKey: [...PURCHASES_SEARCH_QUERY_KEY, 'cable'] })
    ).toBeDefined();
  });

  it('returns an empty list for a successful empty response', async () => {
    mocks.searchSearch.mockResolvedValue(ok({ hits: [] }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurchasesSearch('missing'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.hits).toEqual([]);
  });
});

describe('usePurchasePreview', () => {
  it('is idle for a null purchase id and sends nothing', () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurchasePreview(null), {
      wrapper: withQueryClient(client),
    });

    expect(result.current).toEqual({ purchase: null, status: 'idle', error: null });
    expect(mocks.purchaseGet).not.toHaveBeenCalled();
  });

  it('maps a purchase detail to the read-only preview model', async () => {
    mocks.purchaseGet.mockResolvedValue(ok(purchaseDetail()));
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurchasePreview('po-1'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(mocks.purchaseGet).toHaveBeenCalledWith({ path: { id: 'po-1' } });
    expect(result.current.purchase).toMatchObject({
      id: 'po-1',
      merchant: 'Hardware Barn',
      date: '2026-08-14T03:12:00.000Z',
      totalCents: 21054,
      lines: [{ name: 'Cordless hammer drill, 18V', itemId: 'inv-1' }],
    });
  });

  it('reports a 404 as a purchases API error', async () => {
    mocks.purchaseGet.mockResolvedValue({
      data: undefined,
      error: { message: 'purchase not found' },
      response: { status: 404 },
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurchasePreview('missing'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));

    const error = result.current.error;
    expect(error).toBeInstanceOf(PurchasesApiError);
    if (!(error instanceof PurchasesApiError)) throw new Error('expected a purchases API error');
    expect(error.status).toBe(404);
    expect(error.failure).toBe('api');
  });

  it('reports a transport failure as a purchases transport error', async () => {
    mocks.purchaseGet.mockResolvedValue({
      data: undefined,
      error: new TypeError('Failed to fetch'),
      response: undefined,
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurchasePreview('offline'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));

    const error = result.current.error;
    expect(error).toBeInstanceOf(PurchasesApiError);
    expect(error).not.toBeInstanceOf(InventoryApiError);
    if (!(error instanceof PurchasesApiError)) throw new Error('expected a purchases API error');
    expect(error.failure).toBe('transport');
  });
});

describe('useItemPurchase', () => {
  it('is idle for a null inventory item id and sends nothing', () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useItemPurchase(null), {
      wrapper: withQueryClient(client),
    });

    expect(result.current).toEqual({ purchase: null, status: 'idle', error: null });
    expect(mocks.purchaseList).not.toHaveBeenCalled();
  });

  it('maps the matching purchase into item provenance', async () => {
    mocks.purchaseList.mockResolvedValue(
      ok({
        items: [
          {
            id: 'po-1',
            merchantEntityName: 'Hardware Barn',
            orderedAt: '2026-08-14T03:12:00.000Z',
            source: 'hardware-barn',
          },
        ],
      })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useItemPurchase('inv-1'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(mocks.purchaseList).toHaveBeenCalledWith({
      query: { inventoryItemUri: 'pops://inventory/item/inv-1', limit: 1 },
    });
    expect(result.current.purchase).toEqual({
      id: 'po-1',
      merchant: 'Hardware Barn',
      orderedAt: '2026-08-14T03:12:00.000Z',
    });
  });

  it('returns no purchase for a successful empty response', async () => {
    mocks.purchaseList.mockResolvedValue(ok({ items: [] }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useItemPurchase('missing'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.purchase).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('maps a purchases API failure to PurchasesApiError', async () => {
    mocks.purchaseList.mockResolvedValue({
      data: undefined,
      error: { message: 'purchases unavailable' },
      response: { status: 503 },
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useItemPurchase('offline'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.error).toBeInstanceOf(PurchasesApiError);
    if (!(result.current.error instanceof PurchasesApiError)) {
      throw new Error('expected a purchases API error');
    }
    expect(result.current.error.status).toBe(503);
    expect(result.current.error.failure).toBe('api');
  });
});

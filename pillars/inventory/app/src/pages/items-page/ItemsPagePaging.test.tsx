import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemsListResponses } from '../../inventory-api/types.gen';

type InventoryItem = ItemsListResponses[200]['data'][number];

type SdkResult<T> = { data: T; error: undefined };

function ok<T>(data: T): SdkResult<T> {
  return { data, error: undefined };
}

interface ItemsListQuery {
  search?: string;
  type?: string;
  limit?: number;
  offset?: number;
}
interface ItemsListCallOptions {
  query: ItemsListQuery;
  signal: AbortSignal;
}
type ItemsListMock = (
  options: ItemsListCallOptions
) => Promise<SdkResult<ReturnType<typeof fakeServerList>>>;

const mocks = vi.hoisted(() => ({
  itemsList: vi.fn<ItemsListMock>(),
  itemsDistinctTypes: vi.fn(),
  locationsTree: vi.fn(),
  itemsSearchByAssetId: vi.fn(),
  itemsDelete: vi.fn(),
}));

vi.mock('../../inventory-api/index.js', () => ({
  itemsList: (options: ItemsListCallOptions) => mocks.itemsList(options),
  itemsDistinctTypes: (...args: unknown[]) => mocks.itemsDistinctTypes(...args),
  locationsTree: (...args: unknown[]) => mocks.locationsTree(...args),
  itemsSearchByAssetId: (...args: unknown[]) => mocks.itemsSearchByAssetId(...args),
  itemsDelete: (...args: unknown[]) => mocks.itemsDelete(...args),
}));

import { ItemsPage } from '../ItemsPage';

const TOTAL_ITEMS = 450;
const ELECTRONICS_COUNT = 5;

/**
 * A 450-row fixture — three server pages of the real 200-row limit (200 +
 * 200 + 50) — used to drive a fake `GET /items` that mimics the real
 * contract's `search`/`type`/`limit`/`offset` filtering and `hasMore` math,
 * so the paging walk under test exercises real query semantics.
 */
const ALL_ITEMS: InventoryItem[] = Array.from({ length: TOTAL_ITEMS }, (_, i) => {
  const n = i + 1;
  return {
    assetId: null,
    brand: null,
    condition: null,
    containerId: null,
    deductible: false,
    id: `item-${n}`,
    inUse: null,
    itemId: null,
    itemName: `Item ${String(n).padStart(3, '0')}`,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    location: null,
    locationId: null,
    model: null,
    notes: null,
    purchaseDate: null,
    purchasePrice: null,
    purchaseTransactionId: null,
    purchasedFromId: null,
    purchasedFromName: null,
    replacementValue: null,
    resaleValue: null,
    room: null,
    type: n <= ELECTRONICS_COUNT ? 'Electronics' : null,
    warrantyExpires: null,
  };
});

function fakeServerList(query: ItemsListQuery) {
  const limit = query.limit ?? 200;
  const offset = query.offset ?? 0;
  let filtered = ALL_ITEMS;
  if (query.search) {
    const needle = query.search.toLowerCase();
    filtered = filtered.filter((item) => item.itemName.toLowerCase().includes(needle));
  }
  if (query.type) {
    filtered = filtered.filter((item) => item.type === query.type);
  }
  const data = filtered.slice(offset, offset + limit);
  return {
    data,
    pagination: {
      total: filtered.length,
      limit,
      offset,
      hasMore: offset + limit < filtered.length,
    },
    totals: { totalReplacementValue: 0, totalResaleValue: 0 },
  };
}

function renderWithProviders(): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route path="/inventory" element={<ItemsPage />} />
          <Route path="/inventory/items/:id" element={<div data-testid="item-detail-page" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Items page — paging past 200 rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.itemsDistinctTypes.mockResolvedValue(ok({ data: ['Electronics'] }));
    mocks.locationsTree.mockResolvedValue(ok({ data: [] }));
  });

  it('fetches every page, shows the true total, and finds a row past page 1', async () => {
    mocks.itemsList.mockImplementation(async ({ query }) => ok(fakeServerList(query)));

    renderWithProviders();

    await waitFor(() => expect(screen.getByText(`${TOTAL_ITEMS} items`)).toBeInTheDocument());

    const offsets = mocks.itemsList.mock.calls.map(([opts]) => opts.query.offset);
    expect(offsets).toEqual([0, 200, 400]);
    // hasMore was false after the third page: no fourth request was ever made.
    expect(mocks.itemsList).toHaveBeenCalledTimes(3);

    const searchInput = screen.getByPlaceholderText('Search items or asset IDs...');
    fireEvent.change(searchInput, { target: { value: 'Item 430' } });

    await waitFor(() => expect(screen.getByText('Item 430')).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('cancels an in-flight page walk when a filter changes before it resolves', async () => {
    let capturedSignal: AbortSignal | undefined;
    let releaseFirstFetch: (() => void) | undefined;
    const firstFetchGate = new Promise<void>((resolve) => {
      releaseFirstFetch = resolve;
    });

    mocks.itemsList.mockImplementation(async ({ query, signal }) => {
      if (!query.type && (query.offset ?? 0) === 0) {
        capturedSignal = signal;
        await firstFetchGate;
        if (signal.aborted) throw new DOMException('The operation was aborted', 'AbortError');
      }
      return ok(fakeServerList(query));
    });

    renderWithProviders();

    await waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal?.aborted).toBe(false);

    const typeSelect = screen.getAllByRole('combobox')[0]!;
    await waitFor(() =>
      expect(
        Array.from(typeSelect.querySelectorAll('option')).map((o) => o.getAttribute('value'))
      ).toContain('Electronics')
    );
    fireEvent.change(typeSelect, { target: { value: 'Electronics' } });

    await waitFor(() => expect(capturedSignal?.aborted).toBe(true));

    releaseFirstFetch?.();

    await waitFor(() => expect(screen.getByText(`${ELECTRONICS_COUNT} items`)).toBeInTheDocument());
    // The cancelled all-items fetch never got to page past its first request.
    expect(mocks.itemsList.mock.calls.filter(([opts]) => !opts.query.type)).toHaveLength(1);
  });
});

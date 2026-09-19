import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ searchSearch: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  searchSearch: (...args: unknown[]) => mocks.searchSearch(...args),
}));

import { createTestQueryClient, withQueryClient } from './test-utils';
import { useInventorySearch } from './useInventorySearch';

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useInventorySearch', () => {
  it('does not query for blank text and no filters', () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useInventorySearch('   '), {
      wrapper: withQueryClient(client),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mocks.searchSearch).not.toHaveBeenCalled();
  });

  it('queries with trimmed text and maps filters to eq operators', async () => {
    mocks.searchSearch.mockResolvedValue(ok({ hits: [] }));
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => useInventorySearch('  lamp  ', [{ field: 'room', value: 'Garage' }]),
      { wrapper: withQueryClient(client) }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.searchSearch).toHaveBeenCalledWith({
      body: {
        query: {
          text: 'lamp',
          filters: [{ field: 'room', operator: 'eq', value: 'Garage' }],
        },
      },
    });
  });

  it('queries when filters are present even with empty text', async () => {
    mocks.searchSearch.mockResolvedValue(ok({ hits: [] }));
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => useInventorySearch('', [{ field: 'type', value: 'cable' }]),
      { wrapper: withQueryClient(client) }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.searchSearch).toHaveBeenCalledTimes(1);
  });

  it('surfaces hits from a successful search', async () => {
    mocks.searchSearch.mockResolvedValue(
      ok({
        hits: [
          {
            uri: 'pops://inventory/item/1',
            score: 1,
            matchField: 'name',
            matchType: 'exact',
            data: {},
          },
        ],
      })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useInventorySearch('lamp'), {
      wrapper: withQueryClient(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.hits).toHaveLength(1);
  });
});

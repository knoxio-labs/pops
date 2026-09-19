import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ webList: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webList: (...args: unknown[]) => mocks.webList(...args),
}));

import { createTestQueryClient, withQueryClient } from './test-utils';
import { useWebItems } from './useWebItems';

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWebItems', () => {
  it('fetches the first page with the given filters and default limit', async () => {
    mocks.webList.mockResolvedValue(ok({ items: [{ id: 'a' }], nextCursor: null }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebItems({ typeKey: 'cable' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.webList).toHaveBeenCalledWith({
      query: { typeKey: 'cable', limit: 50, cursor: undefined },
    });
    expect(result.current.data?.pages[0]?.items).toEqual([{ id: 'a' }]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('requests the next page using the previous page nextCursor', async () => {
    mocks.webList
      .mockResolvedValueOnce(ok({ items: [{ id: 'a' }], nextCursor: 'cursor-1' }))
      .mockResolvedValueOnce(ok({ items: [{ id: 'b' }], nextCursor: null }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebItems({}), { wrapper: withQueryClient(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mocks.webList).toHaveBeenLastCalledWith({
      query: { limit: 50, cursor: 'cursor-1' },
    });
    expect(result.current.hasNextPage).toBe(false);
  });

  it('resets pagination when filters change (a new query key)', async () => {
    mocks.webList.mockResolvedValue(ok({ items: [], nextCursor: null }));
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(({ typeKey }) => useWebItems({ typeKey }), {
      wrapper: withQueryClient(client),
      initialProps: { typeKey: 'cable' as string | undefined },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ typeKey: 'bulb' });
    await waitFor(() =>
      expect(mocks.webList).toHaveBeenLastCalledWith({
        query: { typeKey: 'bulb', limit: 50, cursor: undefined },
      })
    );
  });
});

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ webGet: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webGet: (...args: unknown[]) => mocks.webGet(...args),
}));

import { createTestQueryClient, withQueryClient } from './test-utils';
import { useWebItemDetail, useWebItemHistory } from './useWebItemDetail';

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWebItemDetail', () => {
  it('does not fetch while id is undefined', () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebItemDetail(undefined), {
      wrapper: withQueryClient(client),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mocks.webGet).not.toHaveBeenCalled();
  });

  it('fetches the item and its first history page once id resolves', async () => {
    mocks.webGet.mockResolvedValue(
      ok({ item: { id: 'item-1' }, history: { events: [], nextCursor: null } })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebItemDetail('item-1'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.webGet).toHaveBeenCalledWith({
      path: { id: 'item-1' },
      query: { historyLimit: 50 },
    });
    expect(result.current.data?.item.id).toBe('item-1');
  });
});

describe('useWebItemHistory', () => {
  it('paginates using the history sub-object nextCursor', async () => {
    mocks.webGet
      .mockResolvedValueOnce(
        ok({ item: { id: 'item-1' }, history: { events: [{ seq: 2 }], nextCursor: 'h1' } })
      )
      .mockResolvedValueOnce(
        ok({ item: { id: 'item-1' }, history: { events: [{ seq: 1 }], nextCursor: null } })
      );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebItemHistory('item-1'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    expect(mocks.webGet).toHaveBeenLastCalledWith({
      path: { id: 'item-1' },
      query: { historyLimit: 50, historyCursor: 'h1' },
    });
    expect(result.current.hasNextPage).toBe(false);
  });
});

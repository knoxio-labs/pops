import { focusManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ webSummaryGet: vi.fn() }));

vi.mock('../inventory-api/index.js', () => ({
  webSummaryGet: (...args: unknown[]) => mocks.webSummaryGet(...args),
}));

import { InventoryApiError } from '../inventory-api-helpers';
import { createTestQueryClient, withQueryClient } from './test-utils';
import { useWebSummary, WEB_SUMMARY_QUERY_KEY } from './useWebSummary';

import type { WebSummaryGetResponse } from '../inventory-api/types.gen.js';

const summary: WebSummaryGetResponse = {
  counts: {
    items: 8,
    things: 12,
    containers: 3,
    openContainers: 2,
    locations: 4,
    inHand: 1,
  },
  containerSegments: {
    all: 3,
    open: 2,
    closed: 1,
    full: 1,
    moving: 3,
    retired: 0,
  },
  packing: {
    closed: 1,
    fullButOpen: 1,
    open: 1,
    packedItems: 4,
  },
  moving: {
    closed: 1,
    total: 3,
    open: 2,
    full: 1,
    packed: 4,
  },
};

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

beforeEach(() => {
  vi.clearAllMocks();
  focusManager.setFocused(undefined);
});

describe('useWebSummary', () => {
  it('reads the summary under its own web summary key', async () => {
    mocks.webSummaryGet.mockResolvedValue(ok(summary));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSummary(), {
      wrapper: withQueryClient(client),
    });

    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.webSummaryGet).toHaveBeenCalledWith();
    expect(result.current.data).toEqual(summary);
    expect(client.getQueryCache().find({ queryKey: WEB_SUMMARY_QUERY_KEY })).toBeDefined();
    expect(
      client.getQueryCache().find({ queryKey: ['inventory', 'web', 'items'], exact: true })
    ).toBeUndefined();
  });

  it('reports the InventoryApiError on an unsuccessful response', async () => {
    mocks.webSummaryGet.mockResolvedValue({
      data: undefined,
      error: { message: 'summary unavailable' },
      response: { status: 503 },
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSummary(), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(InventoryApiError);
    expect(result.current.error?.message).toBe('summary unavailable');
    expect(result.current.status).toBe('error');
  });

  it('does not refetch when the window focus changes', async () => {
    mocks.webSummaryGet.mockResolvedValue(ok(summary));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSummary(), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    focusManager.setFocused(false);
    focusManager.setFocused(true);

    await waitFor(() => expect(mocks.webSummaryGet).toHaveBeenCalledTimes(1));
  });
});

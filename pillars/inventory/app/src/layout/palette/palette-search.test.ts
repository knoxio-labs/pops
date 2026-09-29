import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { coreItem, coreWorld } from '../../foundation/test-fixtures/core';
import { InventoryApiError } from '../../inventory-api-helpers';
import { PurchasesApiError } from '../../purchases-api-helpers';
import {
  PALETTE_SEARCH_DEBOUNCE_MS,
  inventoryPaletteSearchRecords,
  paletteSearchStatus,
  purchasesPaletteSearchStatus,
  useDebouncedPaletteValue,
} from './palette-search';

import type { WebSearchApi } from '../../inventory-web/useWebSearch';

function searchState(
  status: WebSearchApi['status'],
  error: WebSearchApi['error'] = null
): Pick<WebSearchApi, 'status' | 'error'> {
  return { status, error };
}

describe('inventory palette search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits 200ms before handing a changed query to the server', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedPaletteValue(value),
      { initialProps: { value: '' } }
    );

    rerender({ value: 'lamp' });
    expect(result.current).toBe('');

    act(() => vi.advanceTimersByTime(PALETTE_SEARCH_DEBOUNCE_MS - 1));
    expect(result.current).toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('lamp');
  });

  it('marks a query pending while the raw and debounced values differ', () => {
    expect(paletteSearchStatus('lamp', '', searchState('idle'))).toBe('pending');
    expect(paletteSearchStatus('lamp', 'lamp', searchState('pending'))).toBe('pending');
  });

  it('surfaces inventory server errors', () => {
    expect(
      paletteSearchStatus(
        'lamp',
        'lamp',
        searchState('error', new InventoryApiError('Inventory is offline.', 503))
      )
    ).toEqual({ error: 'Inventory is offline.' });
  });

  it('tracks the purchases search while it debounces, loads, and fails', () => {
    expect(purchasesPaletteSearchStatus('order 42', '', { status: 'idle', error: null })).toBe(
      'pending'
    );
    expect(
      purchasesPaletteSearchStatus('order 42', 'order 42', { status: 'pending', error: null })
    ).toBe('pending');
    expect(
      purchasesPaletteSearchStatus('order 42', 'order 42', { status: 'success', error: null })
    ).toBe('ready');
    expect(
      purchasesPaletteSearchStatus('order 42', 'order 42', {
        status: 'error',
        error: new PurchasesApiError('Purchases are offline.', 503, 'transport'),
      })
    ).toEqual({ error: 'Purchases are offline.' });
  });

  it('treats an empty purchases query as ready without a request', () => {
    expect(purchasesPaletteSearchStatus('', '', { status: 'idle', error: null })).toBe('ready');
  });

  it('deduplicates exact and ranked item hits into palette records', () => {
    const item = coreItem('itm-tv');
    const search: WebSearchApi = {
      results: {
        exact: item,
        items: [{ kind: 'item', item, tier: 'prefix', field: 'code' }],
        places: [],
        total: 1,
      },
      status: 'success',
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: () => undefined,
      refetch: () => undefined,
    };

    expect(inventoryPaletteSearchRecords(search, coreWorld).map((entry) => entry.id)).toEqual([
      'itm-tv',
    ]);
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { coreItem, coreWorld } from '../../foundation/test-fixtures/core';
import { InventoryApiError } from '../../inventory-api-helpers';
import {
  PALETTE_SEARCH_DEBOUNCE_MS,
  inventoryPaletteSearchRecords,
  paletteSearchStatus,
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
    expect(paletteSearchStatus('lamp', '', 'inventory', searchState('idle'))).toBe('pending');
    expect(paletteSearchStatus('lamp', 'lamp', 'inventory', searchState('pending'))).toBe(
      'pending'
    );
  });

  it('surfaces server errors and does not pretend Purchases has a search API', () => {
    expect(
      paletteSearchStatus(
        'lamp',
        'lamp',
        'inventory',
        searchState('error', new InventoryApiError('Inventory is offline.', 503))
      )
    ).toEqual({ error: 'Inventory is offline.' });
    expect(paletteSearchStatus('order 42', 'order 42', 'purchases', searchState('idle'))).toEqual({
      error: 'Purchases search is not available in the current inventory contract.',
    });
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

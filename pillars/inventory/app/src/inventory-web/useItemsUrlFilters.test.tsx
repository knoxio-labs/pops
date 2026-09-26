import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_ITEMS_FILTERS } from './items-url-filters';
import { useContainersUrlFilters, useItemsUrlFilters } from './useItemsUrlFilters';

import type { PropsWithChildren } from 'react';

function wrapper(initialEntry: string) {
  return function RouterWrapper({ children }: PropsWithChildren) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

function useItemsProbe() {
  return { api: useItemsUrlFilters(), location: useLocation() };
}

function useContainersProbe() {
  return { api: useContainersUrlFilters(), location: useLocation() };
}

describe('useItemsUrlFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces q and other filter changes for 150ms', () => {
    const { result } = renderHook(() => useItemsProbe(), {
      wrapper: wrapper('/inventory/items'),
    });

    act(() => result.current.api.setFilters({ q: 'cable' }));
    expect(result.current.api.queryFilters.q).toBe('');

    act(() => vi.advanceTimersByTime(149));
    expect(result.current.api.queryFilters.q).toBe('');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.api.queryFilters.q).toBe('cable');

    act(() => result.current.api.setFilters({ typeKey: 'cable' }));
    expect(result.current.api.queryFilters.typeKey).toBeNull();

    act(() => vi.advanceTimersByTime(149));
    expect(result.current.api.queryFilters.typeKey).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.api.queryFilters.typeKey).toBe('cable');
  });

  it('replaces the URL while keeping parameters it does not own', () => {
    const { result } = renderHook(() => useItemsProbe(), {
      wrapper: wrapper('/inventory/items?selected=item-1&type=old'),
    });

    act(() => result.current.api.setFilters({ typeKey: 'cable', sort: 'updated' }));

    expect(result.current.location.search).toBe('?selected=item-1&type=cable&sort=updated');
  });

  it('caps search text when writing it to the URL', () => {
    const { result } = renderHook(() => useItemsProbe(), {
      wrapper: wrapper('/inventory/items'),
    });
    const input = 'x'.repeat(205);

    act(() => result.current.api.setFilters({ q: input }));

    expect(result.current.location.search).toBe(`?q=${'x'.repeat(200)}`);
    expect(result.current.api.filters.q).toHaveLength(200);
  });

  it('clears narrowing filters while keeping q, sort, view, and segment state', () => {
    const { result } = renderHook(() => useItemsProbe(), {
      wrapper: wrapper(
        '/inventory/items?q=cable&type=old&placement=garage&inactive=1&sort=updated&view=cards&selected=item-1'
      ),
    });

    act(() => result.current.api.clearFilters());

    expect(result.current.location.search).toBe('?selected=item-1&q=cable&sort=updated&view=cards');

    const containers = renderHook(() => useContainersProbe(), {
      wrapper: wrapper(
        '/inventory/containers?q=box&type=storage_box&placement=garage&sort=updated&view=compact&state=moving&selected=item-2'
      ),
    });

    act(() => containers.result.current.api.clearFilters());

    expect(containers.result.current.location.search).toBe(
      '?selected=item-2&q=box&sort=updated&view=compact&state=moving'
    );
  });

  it('starts with URL filters as both the visible and query state', () => {
    const { result } = renderHook(() => useItemsProbe(), {
      wrapper: wrapper('/inventory/items?sort=where'),
    });

    expect(result.current.api.filters).toEqual({ ...DEFAULT_ITEMS_FILTERS, sort: 'where' });
    expect(result.current.api.queryFilters).toEqual({ ...DEFAULT_ITEMS_FILTERS, sort: 'where' });
  });
});

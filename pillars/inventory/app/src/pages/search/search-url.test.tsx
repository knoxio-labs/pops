import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSearchUrlState } from './use-search-url.js';

import type { ReactNode } from 'react';

function renderUrl(initialEntry: string) {
  return renderHook(() => ({ state: useSearchUrlState(), location: useLocation() }), {
    wrapper: ({ children }: { readonly children: ReactNode }) => (
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    ),
  });
}

describe('search URL state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consumes arrival-only code and seeds an empty query without dropping other params', () => {
    const { result } = renderUrl('/inventory/search?code=BX-42&scope=purchases&keep=1');

    expect(result.current.state.arrivalCode).toBe('BX-42');
    expect(result.current.state.url.query).toBe('BX-42');
    expect(result.current.state.url.scope).toBe('purchases');
    expect(result.current.location.search).toBe('?scope=purchases&keep=1&q=BX-42');
  });

  it('debounces query changes for 200ms', async () => {
    const { result } = renderUrl('/inventory/search');

    act(() => result.current.state.patchUrl({ query: 'lamp' }));
    expect(result.current.state.debouncedQuery).toBe('');

    await act(async () => vi.advanceTimersByTimeAsync(199));
    expect(result.current.state.debouncedQuery).toBe('');

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(result.current.state.debouncedQuery).toBe('lamp');
  });

  it('debounces type and placement filters for 150ms', async () => {
    const { result } = renderUrl('/inventory/search');

    act(() => result.current.state.patchUrl({ typeKey: 'lighting', within: 'room' }));
    expect(result.current.state.debouncedFilters).toEqual({ typeKey: null, within: null });

    await act(async () => vi.advanceTimersByTimeAsync(149));
    expect(result.current.state.debouncedFilters).toEqual({ typeKey: null, within: null });

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(result.current.state.debouncedFilters).toEqual({ typeKey: 'lighting', within: 'room' });
  });
});

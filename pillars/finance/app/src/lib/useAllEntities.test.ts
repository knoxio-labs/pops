/**
 * The rules-browser, tag-rules and transactions entity pickers have no
 * pagination, so a single `entities.list` request stopped being "every
 * contact" the moment the set outgrew the server-side cap: entities past it
 * were unpickable, and a rule or transaction could not be pointed at them
 * (POPS-2693).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAllEntities } from './useAllEntities';

const mockEntitiesList = vi.fn();

vi.mock('../contacts-api/index.js', () => ({
  entitiesList: (...args: unknown[]) => mockEntitiesList(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

function entity(id: string, name: string) {
  return {
    id,
    name,
    type: 'company',
    abn: null,
    aliases: [],
    defaultTransactionType: null,
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
  };
}

/** A full first page that reports more, and a second page holding the tail. */
function servesTwoPages(total = 201) {
  const first = Array.from({ length: 200 }, (_, i) => entity(`bulk-${i}`, `Bulk ${i}`));
  const last = [entity('ent-zzz', 'Zanzibar Imports')];
  mockEntitiesList.mockImplementation(({ query }: { query: { offset: number } }) =>
    Promise.resolve({
      data:
        query.offset === 0
          ? { data: first, pagination: { total, limit: 200, offset: 0, hasMore: true } }
          : { data: last, pagination: { total, limit: 200, offset: 200, hasMore: false } },
      error: undefined,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAllEntities', () => {
  it('returns an entity that lives past the first page', async () => {
    servesTwoPages();
    const { result } = renderHook(() => useAllEntities(), { wrapper });

    await waitFor(() => expect(result.current.data?.data).toHaveLength(201));
    expect(result.current.data?.data.map((e) => e.name)).toContain('Zanzibar Imports');
    expect(mockEntitiesList).toHaveBeenCalledTimes(2);
  });

  it('asks for the next page by offset, never re-reading the first', async () => {
    servesTwoPages();
    renderHook(() => useAllEntities(), { wrapper });

    await waitFor(() => expect(mockEntitiesList).toHaveBeenCalledTimes(2));
    expect(mockEntitiesList).toHaveBeenNthCalledWith(1, { query: { limit: 200, offset: 0 } });
    expect(mockEntitiesList).toHaveBeenNthCalledWith(2, { query: { limit: 200, offset: 200 } });
  });

  it('stops after one request when the server says there is no more', async () => {
    mockEntitiesList.mockResolvedValue({
      data: {
        data: [entity('ent-coles', 'Coles')],
        pagination: { total: 1, limit: 200, offset: 0, hasMore: false },
      },
      error: undefined,
    });
    const { result } = renderHook(() => useAllEntities(), { wrapper });

    await waitFor(() => expect(result.current.data?.data).toHaveLength(1));
    expect(mockEntitiesList).toHaveBeenCalledTimes(1);
  });

  it('has no data while the fetch is in flight, so absence is never asserted early', () => {
    mockEntitiesList.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAllEntities(), { wrapper });

    expect(result.current.data).toBeUndefined();
  });
});

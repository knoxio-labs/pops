import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type {
  WebConnectionsListResponse,
  WebConnectionsListResponses,
} from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({
  connectionsConnect: vi.fn(),
  connectionsDisconnect: vi.fn(),
  fixturesConnect: vi.fn(),
  fixturesDisconnect: vi.fn(),
  webConnectionsList: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  connectionsConnect: (...args: unknown[]) => mocks.connectionsConnect(...args),
  connectionsDisconnect: (...args: unknown[]) => mocks.connectionsDisconnect(...args),
  fixturesConnect: (...args: unknown[]) => mocks.fixturesConnect(...args),
  fixturesDisconnect: (...args: unknown[]) => mocks.fixturesDisconnect(...args),
  webConnectionsList: (...args: unknown[]) => mocks.webConnectionsList(...args),
}));

import {
  useAllConnections,
  useConnectionMutations,
  useConnectionsRegistry,
} from './useConnectionsRegistry';

type Page = WebConnectionsListResponses[200];

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function item(id: string, name = id): Page['rows'][number]['item'] {
  return {
    code: null,
    id,
    isContainer: false,
    kind: 'item',
    lifecycle: 'active',
    name,
    typeKey: null,
  };
}

function row(index: number, kind: 'item' | 'fixture' = 'item'): Page['rows'][number] {
  const source = item(`item-${index}`, `Item ${index}`);
  const far =
    kind === 'item'
      ? item(`far-${index}`, `Far ${index}`)
      : {
          id: `fixture-${index}`,
          kind: 'fixture' as const,
          locationId: 'room-1',
          name: `Fixture ${index}`,
          type: 'power',
        };
  return { createdAt: '2026-09-01T00:00:00.000Z', far, id: `connection-${index}`, item: source };
}

function page(overrides: Partial<Page> = {}): Page {
  return {
    nextCursor: null,
    rows: [],
    summary: { connections: 0, fixtures: 0, items: 0 },
    ...overrides,
  };
}

function itemRow(): WebConnectionsListResponse['rows'][number] {
  return row(1, 'item');
}

function fixtureRow(): WebConnectionsListResponse['rows'][number] {
  return row(2, 'fixture');
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.webConnectionsList.mockResolvedValue(ok(page()));
  mocks.connectionsConnect.mockResolvedValue(ok({ message: 'connected' }));
  mocks.connectionsDisconnect.mockResolvedValue(ok({ message: 'disconnected' }));
  mocks.fixturesConnect.mockResolvedValue(ok({ message: 'connected' }));
  mocks.fixturesDisconnect.mockResolvedValue(ok({ message: 'disconnected' }));
});

describe('useConnectionsRegistry', () => {
  it('sends kind and trimmed q, leaving out a blank q', async () => {
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useConnectionsRegistry({ kind: 'fixture', q }),
      {
        initialProps: { q: '  outlet  ' },
        wrapper: withQueryClient(createTestQueryClient()),
      }
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mocks.webConnectionsList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: { cursor: undefined, kind: 'fixture', limit: 200, q: 'outlet' },
      })
    );

    rerender({ q: '   ' });
    await waitFor(() =>
      expect(mocks.webConnectionsList).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: { cursor: undefined, kind: 'fixture', limit: 200 } })
      )
    );
  });

  it('pages with the cursor and keeps the first page summary', async () => {
    mocks.webConnectionsList.mockImplementation(({ query }: { query: { cursor?: string } }) =>
      Promise.resolve(
        ok(
          query.cursor === undefined
            ? page({
                nextCursor: 'cursor-2',
                rows: [row(1)],
                summary: { connections: 2, fixtures: 1, items: 2 },
              })
            : page({
                rows: [row(2, 'fixture')],
                summary: { connections: 1, fixtures: 1, items: 1 },
              })
        )
      )
    );
    const { result } = renderHook(() => useConnectionsRegistry({ kind: 'all', q: '' }), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    expect(result.current.summary).toEqual({ connections: 2, fixtures: 1, items: 2 });
    expect(mocks.webConnectionsList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: { cursor: 'cursor-2', kind: 'all', limit: 200 },
      })
    );
  });

  it('reports pending, then error with the InventoryApiError', async () => {
    mocks.webConnectionsList.mockResolvedValue({
      data: undefined,
      error: { message: 'registry unavailable' },
      response: { status: 503 },
    });
    const { result } = renderHook(() => useConnectionsRegistry({ kind: 'all', q: '' }), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.rows).toEqual([]);
    expect(result.current.summary).toBeNull();
    expect(result.current.error).toMatchObject({ message: 'registry unavailable', status: 503 });
  });

  it('useAllConnections fetches until nextCursor is null', async () => {
    mocks.webConnectionsList.mockImplementation(({ query }: { query: { cursor?: string } }) =>
      Promise.resolve(
        ok(
          query.cursor === undefined
            ? page({ nextCursor: 'next', rows: [row(1)] })
            : page({ rows: [row(2)] })
        )
      )
    );
    const { result } = renderHook(() => useAllConnections(), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.status).toBe('success');
    expect(mocks.webConnectionsList).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { cursor: 'next', kind: 'all', limit: 200 } })
    );
  });
});

describe('useConnectionMutations', () => {
  it('connects items and fixtures, then invalidates connection, fixture and web keys', async () => {
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useConnectionMutations(), {
      wrapper: withQueryClient(queryClient),
    });

    await result.current.connectItems('item-a', 'item-b');
    await result.current.connectFixture('item-a', 'fixture-a');

    expect(mocks.connectionsConnect).toHaveBeenCalledWith({
      body: { itemAId: 'item-a', itemBId: 'item-b' },
    });
    expect(mocks.fixturesConnect).toHaveBeenCalledWith({
      path: { fixtureId: 'fixture-a', itemId: 'item-a' },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'connections'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'fixtures'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'web'] });
    expect(invalidate).toHaveBeenCalledTimes(6);
  });

  it('disconnects an item row or fixture row through the matching route', async () => {
    const queryClient = createTestQueryClient();
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const { result } = renderHook(() => useConnectionMutations(), {
      wrapper: withQueryClient(queryClient),
    });

    await result.current.disconnect(itemRow());
    await result.current.disconnect(fixtureRow());
    await result.current.disconnectFixture('item-3', 'fixture-3');

    expect(mocks.connectionsDisconnect).toHaveBeenCalledWith({
      query: { itemAId: 'item-1', itemBId: 'far-1' },
    });
    expect(mocks.fixturesDisconnect).toHaveBeenNthCalledWith(1, {
      path: { fixtureId: 'fixture-2', itemId: 'item-2' },
    });
    expect(mocks.fixturesDisconnect).toHaveBeenNthCalledWith(2, {
      path: { fixtureId: 'fixture-3', itemId: 'item-3' },
    });
  });

  it('a failed connect rejects and invalidates nothing', async () => {
    mocks.fixturesConnect.mockResolvedValue({
      data: undefined,
      error: { message: 'already connected' },
      response: { status: 409 },
    });
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useConnectionMutations(), {
      wrapper: withQueryClient(queryClient),
    });

    await expect(result.current.connectFixture('item-a', 'fixture-a')).rejects.toMatchObject({
      message: 'already connected',
      status: 409,
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

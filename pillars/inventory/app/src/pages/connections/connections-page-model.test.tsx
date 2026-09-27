import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model.js';

import type { ReactElement, ReactNode } from 'react';

import type { WebConnectionsListResponse } from '../../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({
  allConnections: vi.fn(),
  changed: vi.fn(),
  mutations: vi.fn(),
  online: vi.fn(),
  placement: vi.fn(),
  registry: vi.fn(),
  registryRefetch: vi.fn(),
  queryClient: { refetchQueries: vi.fn(), invalidateQueries: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mocks.queryClient,
}));
vi.mock('../../inventory-web/useConnectionsRegistry.js', () => ({
  CONNECTIONS_REGISTRY_QUERY_KEY: ['inventory', 'connections', 'registry'],
  useAllConnections: (...args: unknown[]) => mocks.allConnections(...args),
  useConnectionMutations: (...args: unknown[]) => mocks.mutations(...args),
  useConnectionsRegistry: (...args: unknown[]) => mocks.registry(...args),
}));
vi.mock('../../inventory-web/useChangedElsewhere.js', () => ({
  useChangedElsewhere: (...args: unknown[]) => mocks.changed(...args),
}));
vi.mock('../../inventory-web/useOnline.js', () => ({
  useOnline: (...args: unknown[]) => mocks.online(...args),
}));
vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: (...args: unknown[]) => mocks.placement(...args),
}));

import { useConnectionsPageModel } from './connections-page-model.js';

function Wrapper({ children }: { readonly children: ReactNode }): ReactElement {
  return <MemoryRouter initialEntries={['/inventory/connections']}>{children}</MemoryRouter>;
}

function row(itemId: string, farId: string): WebConnectionsListResponse['rows'][number] {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    far: {
      code: null,
      id: farId,
      isContainer: false,
      kind: 'item',
      lifecycle: 'active',
      name: farId,
      typeKey: null,
    },
    id: `${itemId}-${farId}`,
    item: {
      code: null,
      id: itemId,
      isContainer: false,
      kind: 'item',
      lifecycle: 'active',
      name: itemId,
      typeKey: null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.registry.mockReturnValue({
    rows: [],
    summary: null,
    status: 'success',
    error: null,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: mocks.registryRefetch,
  });
  mocks.allConnections.mockReturnValue({ rows: [], status: 'success', error: null });
  mocks.mutations.mockReturnValue({
    connectItems: vi.fn(),
    connectFixture: vi.fn(),
    disconnectFixture: vi.fn(),
    disconnect: vi.fn(),
  });
  mocks.online.mockReturnValue(true);
  mocks.placement.mockReturnValue({
    world: buildWorld([], []),
    isLoading: false,
    isError: false,
  });
  mocks.changed.mockReturnValue({ groups: [], stale: false, reload: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useConnectionsPageModel', () => {
  it('debounces q for 200ms before sending the server filter', () => {
    const hook = renderHook(() => useConnectionsPageModel(), { wrapper: Wrapper });

    act(() => hook.result.current.setQueryDraft('cable'));
    expect(mocks.registry).toHaveBeenLastCalledWith({ kind: 'all', q: '' });

    act(() => vi.advanceTimersByTime(199));
    expect(mocks.registry).toHaveBeenLastCalledWith({ kind: 'all', q: '' });

    act(() => vi.advanceTimersByTime(1));
    expect(mocks.registry).toHaveBeenLastCalledWith({ kind: 'all', q: 'cable' });
  });

  it('debounces kind for 150ms before sending the server filter', () => {
    const hook = renderHook(() => useConnectionsPageModel(), { wrapper: Wrapper });

    act(() => hook.result.current.setKindDraft('fixture'));
    expect(mocks.registry).toHaveBeenLastCalledWith({ kind: 'all', q: '' });

    act(() => vi.advanceTimersByTime(149));
    expect(mocks.registry).toHaveBeenLastCalledWith({ kind: 'all', q: '' });

    act(() => vi.advanceTimersByTime(1));
    expect(mocks.registry).toHaveBeenLastCalledWith({ kind: 'fixture', q: '' });
  });

  it('writes the exact query and kind to the URL immediately', () => {
    const hook = renderHook(() => useConnectionsPageModel(), { wrapper: Wrapper });

    act(() => hook.result.current.setQueryDraft('  cable  '));
    expect(hook.result.current.url.q).toBe('  cable  ');

    act(() => hook.result.current.setKindDraft('fixture'));
    expect(hook.result.current.url.kind).toBe('fixture');
  });

  it('requests placement subjects from every distinct item endpoint in first-seen order', () => {
    mocks.allConnections.mockReturnValue({
      rows: [
        row('item-a', 'item-b'),
        row('item-b', 'item-c'),
        {
          ...row('item-a', 'item-b'),
          id: 'fixture-edge',
          far: {
            id: 'fixture-1',
            kind: 'fixture',
            locationId: null,
            name: 'Outlet',
            type: 'power',
          },
        },
      ],
      status: 'success',
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    renderHook(() => useConnectionsPageModel(), { wrapper: Wrapper });

    expect(mocks.placement).toHaveBeenLastCalledWith({
      kind: 'items',
      ids: ['item-a', 'item-b', 'item-c'],
    });
  });

  it('keeps the whole body loading until the unfiltered registry read succeeds', () => {
    mocks.allConnections.mockReturnValue({
      rows: [],
      status: 'pending',
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    const hook = renderHook(() => useConnectionsPageModel(), { wrapper: Wrapper });

    expect(hook.result.current.initialLoading).toBe(true);
    expect(hook.result.current.readError).toBe(false);
  });

  it('reports placement errors and retries connection and placement query families', () => {
    mocks.placement.mockReturnValue({
      world: buildWorld([], []),
      isLoading: false,
      isError: true,
    });

    const hook = renderHook(() => useConnectionsPageModel(), { wrapper: Wrapper });
    hook.result.current.retry();

    expect(hook.result.current.readError).toBe(true);
    expect(mocks.registryRefetch).toHaveBeenCalledOnce();
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['inventory', 'connections'],
    });
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['inventory', 'locations', 'tree'],
    });
    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['inventory', 'web', 'items'],
    });
  });
});

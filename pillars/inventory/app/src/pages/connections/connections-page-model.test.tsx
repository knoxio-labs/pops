import { act, cleanup, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactElement, ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  allConnections: vi.fn(),
  changed: vi.fn(),
  mutations: vi.fn(),
  online: vi.fn(),
  placement: vi.fn(),
  registry: vi.fn(),
  queryClient: { refetchQueries: vi.fn() },
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
    refetch: vi.fn(),
  });
  mocks.allConnections.mockReturnValue({ rows: [], status: 'success', error: null });
  mocks.mutations.mockReturnValue({
    connectItems: vi.fn(),
    connectFixture: vi.fn(),
    disconnectFixture: vi.fn(),
    disconnect: vi.fn(),
  });
  mocks.online.mockReturnValue(true);
  mocks.placement.mockReturnValue({ world: { items: [], locations: [] } });
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
});

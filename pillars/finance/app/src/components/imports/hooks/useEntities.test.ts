/**
 * The import pickers have no pagination, so their entity source must be the
 * whole contact set. `entities.list` cannot be it: the contacts pillar hard-caps
 * a page at 200, and the tail of a larger set was invisible — an existing
 * merchant looked absent and accepting it minted a duplicate.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../../store/importStore';
import { useEntities } from './useEntities';

const mockEntitiesLookup = vi.fn();
const mockEntitiesList = vi.fn();

vi.mock('../../../contacts-api/index.js', () => ({
  entitiesLookup: (...args: unknown[]) => mockEntitiesLookup(...args),
  entitiesList: (...args: unknown[]) => mockEntitiesList(...args),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

function lookupResolves(...names: Array<[id: string, name: string]>) {
  mockEntitiesLookup.mockResolvedValue({
    data: {
      entities: names.map(([id, name]) => ({ id, name, aliases: [] })),
      fetchedAt: '2026-01-01T00:00:00.000Z',
    },
    error: undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.getState().reset();
  lookupResolves(['ent-coles', 'Coles'], ['ent-woolies', 'Woolworths']);
});

describe('useEntities', () => {
  it('sources the whole contact set from the bulk lookup, never a capped page', async () => {
    const { result } = renderHook(() => useEntities(), { wrapper });

    await waitFor(() => expect(result.current.entities).toHaveLength(2));
    expect(mockEntitiesLookup).toHaveBeenCalledTimes(1);
    expect(mockEntitiesList).not.toHaveBeenCalled();
  });

  it('leaves entities undefined until the fetch resolves, so absence is never asserted early', () => {
    mockEntitiesLookup.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useEntities(), { wrapper });

    expect(result.current.entities).toBeUndefined();
    expect(result.current.dbEntities).toBeUndefined();
  });

  it('merges a session-pending entity into its alphabetical place', async () => {
    const { result } = renderHook(() => useEntities(), { wrapper });
    await waitFor(() => expect(result.current.entities).toHaveLength(2));

    result.current.addPendingEntity({ name: 'Bunnings', type: 'company' });

    await waitFor(() => expect(result.current.entities).toHaveLength(3));
    expect(result.current.entities?.map((e) => e.name)).toEqual([
      'Bunnings',
      'Coles',
      'Woolworths',
    ]);
    expect(result.current.entities?.[0]?.id).toMatch(/^temp:entity:/);
  });

  it('exposes the DB set alone, so a duplicate-name check is not fooled by pending ones', async () => {
    const { result } = renderHook(() => useEntities(), { wrapper });
    await waitFor(() => expect(result.current.dbEntities).toHaveLength(2));

    result.current.addPendingEntity({ name: 'Bunnings', type: 'company' });

    await waitFor(() => expect(result.current.entities).toHaveLength(3));
    expect(result.current.dbEntities?.map((e) => e.name)).toEqual(['Coles', 'Woolworths']);
  });
});

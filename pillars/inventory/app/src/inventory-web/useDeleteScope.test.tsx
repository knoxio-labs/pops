import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type { ItemRowModel, LocationModel } from '../foundation/model/model.js';
import type { ItemRows, WebItemsFilters } from './useWebItems';

const mocks = vi.hoisted(() => ({
  useItemRows: vi.fn(),
  useWebSearchLocations: vi.fn(),
}));

vi.mock('./useWebItems.js', () => ({
  useItemRows: (...args: unknown[]) => mocks.useItemRows(...args),
}));

vi.mock('./useWebSearchLocations.js', () => ({
  useWebSearchLocations: () => mocks.useWebSearchLocations(),
}));

import { useDeleteScope } from './useDeleteScope';

const garage: LocationModel = { id: 'garage', name: 'Garage', parentId: null, kind: 'room' };

function item(id: string, lifecycle: ItemRowModel['lifecycle']): ItemRowModel {
  return {
    id,
    name: id,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle,
    placement: { kind: 'location', locationId: 'garage' },
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function rows(overrides: Partial<ItemRows> = {}): ItemRows {
  return {
    rows: [],
    total: 0,
    unfilteredTotal: 0,
    hiddenInactiveCount: 0,
    baseline: 0,
    hidden: 0,
    contentCounts: {},
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

let scopeRows: ItemRows;

beforeEach(() => {
  vi.clearAllMocks();
  scopeRows = rows({
    rows: [item('active', 'active'), item('retired', 'retired')],
  });
  mocks.useItemRows.mockImplementation((_query: WebItemsFilters) => scopeRows);
  mocks.useWebSearchLocations.mockReturnValue({ locations: [garage], status: 'success' });
});

describe('useDeleteScope', () => {
  it('queries everything within the place with includeInactive true and loads every page', async () => {
    const fetchNextPage = vi.fn();
    scopeRows = rows({ hasNextPage: true, fetchNextPage });
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(() => useDeleteScope('garage'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(fetchNextPage).toHaveBeenCalledTimes(1));
    expect(mocks.useItemRows).toHaveBeenCalledWith(
      { within: 'garage', includeInactive: true },
      200
    );
    expect(result.current.status).toBe('pending');

    scopeRows = rows({ rows: [item('active', 'active'), item('retired', 'retired')] });
    rerender();
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect([...result.current.world.items.keys()]).toEqual(['active', 'retired']);
    expect(result.current.world.locations.get('garage')).toEqual(garage);
  });
});

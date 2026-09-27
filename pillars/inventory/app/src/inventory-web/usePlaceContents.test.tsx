import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type { ItemRowModel, LocationModel } from '../foundation/model/model.js';
import type { WebItemsFilters, ItemRows } from './useWebItems';

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

import { usePlaceContents } from './usePlaceContents';

const room: LocationModel = { id: 'room', name: 'Room', parentId: null, kind: 'room' };

function item(id: string, placement: ItemRowModel['placement']): ItemRowModel {
  return {
    id,
    name: id,
    typeId: null,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement,
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

let directRows: ItemRows;
let boxedRows: ItemRows;

beforeEach(() => {
  vi.clearAllMocks();
  directRows = rows({ rows: [item('loose', { kind: 'location', locationId: 'room' })] });
  boxedRows = rows({ rows: [item('boxed', { kind: 'container', containerId: 'box' })] });
  mocks.useItemRows.mockImplementation((query: WebItemsFilters) =>
    query.placementKind === 'location' ? directRows : boxedRows
  );
  mocks.useWebSearchLocations.mockReturnValue({ locations: [room], status: 'success' });
});

describe('usePlaceContents', () => {
  it('queries things directly here and things boxed here', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePlaceContents('room'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(mocks.useItemRows).toHaveBeenCalledWith(
      { placementKind: 'location', locationId: 'room' },
      200
    );
    expect(mocks.useItemRows).toHaveBeenCalledWith(
      { placementKind: 'container', effectiveLocationId: 'room' },
      200
    );
    expect([...result.current.world.items.keys()]).toEqual(['loose', 'boxed']);
    expect(result.current.world.locations.get('room')).toEqual(room);
  });

  it('loads every page before reporting success', async () => {
    const directFetch = vi.fn();
    const boxedFetch = vi.fn();
    directRows = rows({ hasNextPage: true, fetchNextPage: directFetch });
    boxedRows = rows({ hasNextPage: true, fetchNextPage: boxedFetch });
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(() => usePlaceContents('room'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => {
      expect(directFetch).toHaveBeenCalledTimes(1);
      expect(boxedFetch).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('pending');
    });

    directRows = rows();
    boxedRows = rows();
    rerender();
    await waitFor(() => expect(result.current.status).toBe('success'));
  });

  it('builds one world from both lists and the location tree', async () => {
    directRows = rows({ rows: [item('direct', { kind: 'location', locationId: 'room' })] });
    boxedRows = rows({ rows: [item('nested', { kind: 'container', containerId: 'box' })] });
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePlaceContents('room'), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.world.items).toEqual(
      new Map([
        ['direct', directRows.rows[0]],
        ['nested', boxedRows.rows[0]],
      ])
    );
    expect(result.current.world.locations).toEqual(new Map([['room', room]]));
  });
});

import { focusManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type {
  FixturesListResponses,
  TypesReadCatalogueResponses,
  WebListResponses,
} from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({
  fixturesList: vi.fn(),
  fixturesListItems: vi.fn(),
  typesReadCatalogue: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  fixturesList: (...args: unknown[]) => mocks.fixturesList(...args),
  fixturesListItems: (...args: unknown[]) => mocks.fixturesListItems(...args),
  typesReadCatalogue: (...args: unknown[]) => mocks.typesReadCatalogue(...args),
}));

import { useFixtureItems, useFixtures } from './useFixtures';

type Fixture = FixturesListResponses[200]['data'][number];
type Item = WebListResponses[200]['items'][number];
type Catalogue = TypesReadCatalogueResponses[200];

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function fixture(id: string, name = id): Fixture {
  return {
    createdAt: '2026-09-01T00:00:00.000Z',
    id,
    lastEditedTime: '2026-09-01T00:00:00.000Z',
    locationId: 'room-1',
    name,
    notes: null,
    type: 'power',
  };
}

const baseItem: Item = {
  access: null,
  catalogueRevision: 1,
  code: null,
  computedValues: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  deletedAt: null,
  documentTitles: [],
  documentsStatus: 'none',
  externalIds: [],
  fieldValues: [],
  fields: {},
  id: 'item-1',
  isContainer: false,
  isFull: null,
  legacyType: null,
  lifecycle: 'active',
  lifecycleChangedAt: null,
  name: 'Lamp',
  note: null,
  photos: [],
  placement: { kind: 'location', locationId: 'room-1' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function item(id: string, name: string): Item {
  return { ...baseItem, id, name };
}

function catalogue(): Catalogue {
  return {
    revision: {
      abandoned: null,
      baseRevision: null,
      created: {
        actor: { id: 'migration', kind: 'migration', label: 'Migration' },
        at: '2026-09-01T00:00:00.000Z',
      },
      draftVersion: 1,
      minimumProtocol: 1,
      published: {
        actor: { id: 'migration', kind: 'migration', label: 'Migration' },
        at: '2026-09-01T00:00:00.000Z',
        note: null,
      },
      revision: 1,
      status: 'published',
    },
    types: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.fixturesList.mockResolvedValue(ok({ data: [], total: 0 }));
  mocks.fixturesListItems.mockResolvedValue(
    ok({
      data: [],
      pagination: { hasMore: false, limit: 50, offset: 0, total: 0 },
    })
  );
  mocks.typesReadCatalogue.mockResolvedValue(ok(catalogue()));
  focusManager.setFocused(undefined);
});

describe('useFixtures', () => {
  it('sends search, type and withinLocationId only when set', async () => {
    const { result } = renderHook(
      () => useFixtures({ search: '  lamp  ', type: 'power', withinLocationId: 'room-1' }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mocks.fixturesList).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          limit: 50,
          offset: 0,
          search: 'lamp',
          type: 'power',
          locationId: 'room-1',
        },
      })
    );

    mocks.fixturesList.mockClear();
    const { result: blankResult } = renderHook(
      () => useFixtures({ search: '   ', type: null, withinLocationId: null }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );
    await waitFor(() => expect(blankResult.current.status).toBe('success'));
    expect(mocks.fixturesList).toHaveBeenCalledWith(
      expect.objectContaining({ query: { limit: 50, offset: 0 } })
    );
  });

  it('returns empty rows and total zero for an empty or filtered-empty list', async () => {
    mocks.fixturesList.mockResolvedValue(ok({ data: [], total: 0 }));
    const { result } = renderHook(
      () => useFixtures({ search: 'dishwasher', type: null, withinLocationId: null }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.rows).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(mocks.fixturesList).toHaveBeenCalledWith(
      expect.objectContaining({ query: { limit: 50, offset: 0, search: 'dishwasher' } })
    );
  });

  it('reports pending, then error with the InventoryApiError', async () => {
    mocks.fixturesList.mockResolvedValue({
      data: undefined,
      error: { message: 'fixtures unavailable' },
      response: { status: 500 },
    });
    const { result } = renderHook(
      () => useFixtures({ search: '', type: null, withinLocationId: null }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.rows).toEqual([]);
    expect(result.current.error).toMatchObject({ message: 'fixtures unavailable', status: 500 });
  });

  it('reports a failed next page while keeping the loaded rows and total', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => fixture(`fixture-${index}`));
    mocks.fixturesList
      .mockResolvedValueOnce(ok({ data: firstPage, total: 70 }))
      .mockResolvedValueOnce({
        data: undefined,
        error: { message: 'next page failed' },
        response: { status: 500 },
      });
    const { result } = renderHook(
      () => useFixtures({ search: '', type: null, withinLocationId: null }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.rows).toHaveLength(50);
    expect(result.current.total).toBe(70);
    expect(result.current.error).toMatchObject({ message: 'next page failed', status: 500 });
    expect(mocks.fixturesList).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: { limit: 50, offset: 50 } })
    );
  });
});

describe('useFixtureItems', () => {
  it('maps wired items and pages by offset until pagination.total', async () => {
    mocks.fixturesListItems
      .mockResolvedValueOnce(
        ok({
          data: [item('item-1', 'Lamp')],
          pagination: { hasMore: true, limit: 50, offset: 0, total: 2 },
        })
      )
      .mockResolvedValueOnce(
        ok({
          data: [item('item-2', 'TV')],
          pagination: { hasMore: false, limit: 50, offset: 1, total: 2 },
        })
      );
    const { result } = renderHook(() => useFixtureItems('fixture-1'), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.items.map((entry) => entry.name)).toEqual(['Lamp']);
    expect(result.current.total).toBe(2);
    expect(result.current.hasNextPage).toBe(true);

    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.items.map((entry) => entry.name)).toEqual(['Lamp', 'TV']);
    expect(mocks.fixturesListItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: { fixtureId: 'fixture-1' },
        query: { limit: 50, offset: 1 },
      })
    );
  });

  it('reports pending, then error for fixture items with the InventoryApiError', async () => {
    mocks.fixturesListItems.mockResolvedValue({
      data: undefined,
      error: { message: 'fixture items unavailable' },
      response: { status: 502 },
    });
    const { result } = renderHook(() => useFixtureItems('fixture-1'), {
      wrapper: withQueryClient(createTestQueryClient()),
    });

    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.items).toEqual([]);
    expect(result.current.total).toBeNull();
    expect(result.current.error).toMatchObject({
      message: 'fixture items unavailable',
      status: 502,
    });
  });

  it('does not refetch fixture or fixture-item reads on focus', async () => {
    mocks.fixturesList.mockResolvedValue(ok({ data: [fixture('fixture-1')], total: 1 }));
    mocks.fixturesListItems.mockResolvedValue(
      ok({
        data: [item('item-1', 'Lamp')],
        pagination: { hasMore: false, limit: 50, offset: 0, total: 1 },
      })
    );
    const { result } = renderHook(
      () => ({
        fixtures: useFixtures({ search: '', type: null, withinLocationId: null }),
        items: useFixtureItems('fixture-1'),
      }),
      { wrapper: withQueryClient(createTestQueryClient()) }
    );

    await waitFor(() => {
      expect(result.current.fixtures.status).toBe('success');
      expect(result.current.items.status).toBe('success');
    });
    expect(mocks.fixturesList).toHaveBeenCalledTimes(1);
    expect(mocks.fixturesListItems).toHaveBeenCalledTimes(1);

    await act(async () => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await Promise.resolve();
    });
    expect(mocks.fixturesList).toHaveBeenCalledTimes(1);
    expect(mocks.fixturesListItems).toHaveBeenCalledTimes(1);
  });
});

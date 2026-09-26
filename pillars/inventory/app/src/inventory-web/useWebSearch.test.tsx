import { focusManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestQueryClient, withQueryClient } from './test-utils';

import type {
  LocationsTreeResponses,
  TypesReadCatalogueResponses,
  WebListResponses,
} from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({
  locationsTree: vi.fn(),
  typesReadCatalogue: vi.fn(),
  webSearchList: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  locationsTree: (...args: unknown[]) => mocks.locationsTree(...args),
  typesReadCatalogue: (...args: unknown[]) => mocks.typesReadCatalogue(...args),
  webSearchList: (...args: unknown[]) => mocks.webSearchList(...args),
}));

import { useWebSearch, type SearchTier, type WebSearchParams } from './useWebSearch';

type WebItem = WebListResponses['200']['items'][number];
type LocationTreeResponse = LocationsTreeResponses[200];
type Catalogue = TypesReadCatalogueResponses[200];
type SearchItemField = 'code' | 'note' | 'type' | 'place' | null;

interface SearchPage {
  readonly exact: WebItem | null;
  readonly places: readonly {
    readonly location: { readonly id: string };
    readonly tier: 'prefix' | 'contains';
  }[];
  readonly items: readonly {
    readonly item: WebItem;
    readonly tier: SearchTier;
    readonly field: SearchItemField;
  }[];
  readonly nextCursor: string | null;
  readonly total: number;
}

const catalogue: Catalogue = {
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
    revision: 3,
    status: 'published',
  },
  types: [
    {
      archivedAt: null,
      capabilities: ['containment'],
      description: 'Cable type',
      fields: [],
      id: 'type-cable',
      key: 'cable',
      label: 'Cables',
      legacyLabels: [],
      presentation: {},
      replacedBy: null,
      revision: 3,
      sortOrder: 0,
    },
  ],
};

const baseItem: WebItem = {
  access: null,
  catalogueRevision: 3,
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
  name: 'Item',
  note: null,
  photos: [],
  placement: { kind: 'location', locationId: 'room' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-09-02T00:00:00.000Z',
};

const locations: LocationTreeResponse = {
  data: [
    {
      id: 'room',
      name: 'Room',
      parentId: null,
      sortOrder: 0,
      children: [],
    },
  ],
};

function item(id: string, overrides: Partial<WebItem> = {}): WebItem {
  return { ...baseItem, ...overrides, id, name: id };
}

function searchPage(overrides: Partial<SearchPage> = {}): SearchPage {
  return {
    exact: null,
    places: [],
    items: [],
    nextCursor: null,
    total: 0,
    ...overrides,
  };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

beforeEach(() => {
  vi.clearAllMocks();
  focusManager.setFocused(undefined);
  mocks.locationsTree.mockResolvedValue(ok(locations));
  mocks.typesReadCatalogue.mockResolvedValue(ok(catalogue));
  mocks.webSearchList.mockResolvedValue(ok(searchPage()));
});

describe('useWebSearch', () => {
  it('is idle for a blank query and sends nothing', () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSearch({ q: '  ' }), {
      wrapper: withQueryClient(client),
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.results).toEqual({ exact: null, items: [], places: [], total: 0 });
    expect(mocks.webSearchList).not.toHaveBeenCalled();
  });

  it('maps item hits to the web model with their tier and field', async () => {
    mocks.webSearchList.mockResolvedValue(
      ok({
        ...searchPage(),
        items: [
          {
            item: item('item-1', {
              code: 'CAB-1',
              note: 'Short cable',
              typeId: 'type-cable',
              typeKey: 'cable',
              previousPlacement: { kind: 'location', locationId: 'deleted-room' },
            }),
            tier: 'prefix',
            field: 'code',
          },
          { item: item('item-2'), tier: 'contains', field: 'note' },
          { item: item('item-3'), tier: 'other', field: null },
        ],
        total: 3,
      })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSearch({ q: ' cab ' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.results.items).toMatchObject([
      {
        kind: 'item',
        tier: 'prefix',
        field: 'code',
        item: {
          id: 'item-1',
          typeName: 'Cables',
          previous: { kind: 'location', locationId: 'deleted-room' },
        },
      },
      { kind: 'item', tier: 'contains', field: 'note', item: { id: 'item-2' } },
      { kind: 'item', tier: 'other', field: null, item: { id: 'item-3' } },
    ]);
  });

  it('maps place hits to location models and drops one not in tree', async () => {
    mocks.webSearchList.mockResolvedValue(
      ok({
        ...searchPage(),
        places: [
          { location: { id: 'room' }, tier: 'prefix' },
          { location: { id: 'missing' }, tier: 'contains' },
        ],
      })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSearch({ q: 'room' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.results.places).toEqual([
      {
        kind: 'place',
        place: { id: 'room', name: 'Room', parentId: null, kind: 'property' },
        tier: 'prefix',
      },
    ]);
  });

  it('sends activeOnly only when true', async () => {
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(
      ({ params }: { params: WebSearchParams }) => useWebSearch(params),
      {
        initialProps: {
          params: {
            q: ' cable ',
            typeKey: 'cable',
            within: 'room',
            activeOnly: false,
            limit: 8,
          },
        },
        wrapper: withQueryClient(client),
      }
    );

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(mocks.webSearchList).toHaveBeenCalledWith({
      query: { q: 'cable', typeKey: 'cable', within: 'room', limit: 8, cursor: undefined },
    });

    rerender({
      params: {
        q: ' cable ',
        typeKey: 'cable',
        within: 'room',
        activeOnly: true,
        limit: 8,
      },
    });

    await waitFor(() => expect(mocks.webSearchList).toHaveBeenCalledTimes(2));
    expect(mocks.webSearchList).toHaveBeenLastCalledWith({
      query: {
        q: 'cable',
        typeKey: 'cable',
        within: 'room',
        activeOnly: 'true',
        limit: 8,
        cursor: undefined,
      },
    });
  });

  it('keeps exact and places from the first page and appends items from later pages', async () => {
    const exact = item('exact', { code: 'CAB-EXACT' });
    mocks.webSearchList.mockImplementation(async ({ query }: { query: { cursor?: string } }) =>
      ok(
        query.cursor === undefined
          ? searchPage({
              exact,
              places: [{ location: { id: 'room' }, tier: 'prefix' }],
              items: [{ item: item('item-1'), tier: 'prefix', field: 'code' }],
              nextCursor: 'next',
              total: 3,
            })
          : searchPage({
              exact: item('wrong-exact'),
              places: [{ location: { id: 'missing' }, tier: 'contains' }],
              items: [{ item: item('item-2'), tier: 'contains', field: 'note' }],
              total: 99,
            })
      )
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSearch({ q: 'item' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.results.items).toHaveLength(2));

    expect(result.current.results.exact?.id).toBe('exact');
    expect(result.current.results.places).toHaveLength(1);
    expect(result.current.results.items.map(({ item: row }) => row.id)).toEqual([
      'item-1',
      'item-2',
    ]);
    expect(result.current.results.total).toBe(3);
    expect(mocks.webSearchList).toHaveBeenLastCalledWith({
      query: { q: 'item', limit: 20, cursor: 'next' },
    });
  });

  it('gives empty results with success for a filtered query with no match', async () => {
    mocks.webSearchList.mockResolvedValue(ok(searchPage({ total: 0 })));
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => useWebSearch({ q: 'missing', typeKey: 'cable', within: 'room' }),
      { wrapper: withQueryClient(client) }
    );

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.results).toEqual({ exact: null, items: [], places: [], total: 0 });
  });

  it('reports a search request error as error', async () => {
    mocks.webSearchList.mockResolvedValue({
      data: undefined,
      error: { message: 'Search failed' },
      response: { status: 503 },
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSearch({ q: 'cable' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.error).toMatchObject({ message: 'Search failed', status: 503 });
    expect(result.current.results).toEqual({ exact: null, items: [], places: [], total: 0 });
  });

  it('reports error, not pending, when the location tree fails', async () => {
    mocks.locationsTree.mockResolvedValue({
      data: undefined,
      error: { message: 'Location tree failed' },
      response: { status: 503 },
    });
    mocks.webSearchList.mockResolvedValue(
      ok({
        ...searchPage(),
        exact: item('exact'),
        places: [{ location: { id: 'room' }, tier: 'prefix' }],
        items: [{ item: item('item-1'), tier: 'prefix', field: 'code' }],
        total: 2,
      })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSearch({ q: 'cable' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.error).toBeNull();
    expect(result.current.results.exact?.id).toBe('exact');
    expect(result.current.results.items).toHaveLength(1);
    expect(result.current.results.places).toEqual([]);
  });

  it('does not refetch when the window regains focus', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSearch({ q: 'cable' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    const calls = mocks.webSearchList.mock.calls.length;

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.webSearchList).toHaveBeenCalledTimes(calls);
  });

  it('keeps loaded pages while the web cache is invalidated', async () => {
    mocks.webSearchList.mockImplementation(async ({ query }: { query: { cursor?: string } }) =>
      ok(
        query.cursor === undefined
          ? searchPage({
              items: [{ item: item('item-1'), tier: 'prefix', field: 'code' }],
              nextCursor: 'next',
              total: 2,
            })
          : searchPage({
              items: [{ item: item('item-2'), tier: 'contains', field: 'note' }],
              total: 2,
            })
      )
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebSearch({ q: 'item' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));
    await act(async () => {
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.results.items).toHaveLength(2));

    await act(async () => {
      await client.invalidateQueries({ queryKey: ['inventory', 'web'] });
    });

    expect(result.current.results.items.map(({ item: row }) => row.id)).toEqual([
      'item-1',
      'item-2',
    ]);
  });
});

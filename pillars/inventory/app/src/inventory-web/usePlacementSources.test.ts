import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WEB_ITEMS_MAX_IDS } from '@pops/inventory';

import { LOCATION_TREE_QUERY_KEY } from './queryKeys';
import { createTestQueryClient, withQueryClient } from './test-utils';

import type {
  LocationsTreeResponses,
  WebListData,
  WebListResponses,
  WebPlacementSourcesData,
  WebPlacementSourcesResponses,
} from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({
  locationsCreate: vi.fn(),
  locationsTree: vi.fn(),
  typesReadCatalogue: vi.fn(),
  webList: vi.fn(),
  webPlacementSources: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  locationsCreate: (...args: unknown[]) => mocks.locationsCreate(...args),
  locationsTree: (...args: unknown[]) => mocks.locationsTree(...args),
  typesReadCatalogue: (...args: unknown[]) => mocks.typesReadCatalogue(...args),
  webList: (...args: unknown[]) => mocks.webList(...args),
  webPlacementSources: (...args: unknown[]) => mocks.webPlacementSources(...args),
}));

vi.mock('./recents.js', () => ({
  useRecents: () => ({
    queries: ['cable'],
    records: [{ kind: 'item', id: 'recent-item' }],
    placements: [{ kind: 'location', locationId: 'recent-location' }],
  }),
}));

import { usePlacementSources } from './usePlacementSources';

type WebItem = WebListResponses['200']['items'][number];
type LocationTreeResponse = LocationsTreeResponses[200];
type PlacementSource = WebPlacementSourcesResponses[200]['items'][number];

const catalogue = {
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
  types: [],
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

const rootLocation: LocationTreeResponse['data'][number] = {
  id: 'room',
  name: 'Room',
  parentId: null,
  sortOrder: 0,
  children: [],
};

function item(id: string, overrides: Partial<WebItem> = {}): WebItem {
  return { ...baseItem, ...overrides, id, name: id };
}

function container(id: string, access: 'open' | 'closed'): PlacementSource {
  return {
    id,
    name: id,
    access,
    isContainer: true,
    isFull: false,
    code: 'BOX',
    typeId: null,
    typeKey: null,
    legacyType: null,
    quantity: 1,
    lifecycle: 'active',
    placement: { kind: 'location', locationId: 'room' },
    previousPlacement: null,
    note: 'Container note',
    updatedAt: '2026-09-02T00:00:00.000Z',
  };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

function emptyPage() {
  return ok({
    hiddenInactiveCount: 0,
    items: [],
    nextCursor: null,
    total: 0,
    unfilteredTotal: 0,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.locationsTree.mockResolvedValue(ok({ data: [rootLocation] }));
  mocks.typesReadCatalogue.mockResolvedValue(ok(catalogue));
  mocks.locationsCreate.mockResolvedValue(
    ok({
      data: {
        id: 'new-location',
        name: 'New location',
        parentId: 'room',
        sortOrder: 1,
      },
      message: 'Location created',
    })
  );
  mocks.webList.mockResolvedValue(emptyPage());
  mocks.webPlacementSources.mockResolvedValue(ok({ items: [], nextCursor: null }));
});

describe('usePlacementSources', () => {
  it('loads lightweight containers once per page without a hydrated item list request', async () => {
    mocks.webPlacementSources.mockImplementation(
      async ({ query }: { query: WebPlacementSourcesData['query'] }) =>
        query?.cursor === undefined
          ? ok({
              items: [container('open-1', 'open'), container('closed-1', 'closed')],
              nextCursor: 'next',
            })
          : ok({
              items: [container('open-2', 'open'), container('closed-2', 'closed')],
              nextCursor: null,
            })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => usePlacementSources({ kind: 'place', locationId: 'room' }),
      { wrapper: withQueryClient(client) }
    );

    await waitFor(() => expect(result.current.openContainers).toHaveLength(2));
    expect(result.current.closedContainers).toHaveLength(2);
    expect(mocks.webPlacementSources).toHaveBeenCalledTimes(2);
    expect(mocks.webPlacementSources).toHaveBeenNthCalledWith(1, {
      query: { cursor: undefined, limit: WEB_ITEMS_MAX_IDS },
      signal: expect.any(AbortSignal),
    });
    expect(mocks.webPlacementSources).toHaveBeenNthCalledWith(2, {
      query: { cursor: 'next', limit: WEB_ITEMS_MAX_IDS },
      signal: expect.any(AbortSignal),
    });
    expect(mocks.webList).not.toHaveBeenCalled();
    expect(result.current.openContainers[0]).toMatchObject({
      id: 'open-1',
      code: 'BOX',
      note: 'Container note',
      container: { access: 'open', full: false },
      placement: { kind: 'location', locationId: 'room' },
    });
    expect(result.current.recents).toEqual([{ kind: 'location', locationId: 'recent-location' }]);
  });

  it('shares the container request between simultaneous placement pickers', async () => {
    mocks.webPlacementSources.mockResolvedValue(
      ok({ items: [container('shared', 'open')], nextCursor: null })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => ({
        first: usePlacementSources({ kind: 'place', locationId: 'room' }),
        second: usePlacementSources({ kind: 'place', locationId: 'another-room' }),
      }),
      { wrapper: withQueryClient(client) }
    );

    await waitFor(() => expect(result.current.first.isLoading).toBe(false));
    expect(result.current.second.openContainers).toEqual(result.current.first.openContainers);
    expect(mocks.webPlacementSources).toHaveBeenCalledOnce();
    expect(mocks.webList).not.toHaveBeenCalled();
  });

  it('aborts an unused container request before fetching another page', async () => {
    let resolvePage:
      | ((page: ReturnType<typeof ok<WebPlacementSourcesResponses[200]>>) => void)
      | undefined;
    let requestSignal: AbortSignal | undefined;
    mocks.webPlacementSources.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      requestSignal = signal;
      return new Promise<ReturnType<typeof ok<WebPlacementSourcesResponses[200]>>>((resolve) => {
        resolvePage = resolve;
      });
    });
    const client = createTestQueryClient();
    const hook = renderHook(() => usePlacementSources({ kind: 'place', locationId: 'room' }), {
      wrapper: withQueryClient(client),
    });
    await waitFor(() => expect(mocks.webPlacementSources).toHaveBeenCalledOnce());
    hook.unmount();
    expect(requestSignal?.aborted).toBe(true);
    await act(async () => {
      if (resolvePage === undefined) throw new Error('container request was not started');
      resolvePage(ok({ items: [container('first', 'open')], nextCursor: 'next' }));
    });
    expect(mocks.webPlacementSources).toHaveBeenCalledOnce();
  });

  it('reports a failed page without exposing an incomplete container world', async () => {
    mocks.webPlacementSources
      .mockResolvedValueOnce(ok({ items: [container('first', 'open')], nextCursor: 'next' }))
      .mockRejectedValueOnce(new Error('container page failed'));
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => usePlacementSources({ kind: 'place', locationId: 'room' }),
      {
        wrapper: withQueryClient(client),
      }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error('container page failed'));
    expect(result.current.openContainers).toEqual([]);
    expect(result.current.closedContainers).toEqual([]);
    expect(mocks.webList).not.toHaveBeenCalled();
  });

  it('dedupes subject ids, chunks them at the contract limit, and includes inactive items', async () => {
    const ids = Array.from({ length: WEB_ITEMS_MAX_IDS + 2 }, (_, index) => `subject-${index}`);
    const subjectIds = [...ids, ids[0] ?? '', 'shared'];
    mocks.webPlacementSources.mockResolvedValue(
      ok({ items: [container('shared', 'open')], nextCursor: null })
    );
    mocks.webList.mockImplementation(async ({ query }: { query: WebListData['query'] }) => {
      if (query.ids !== undefined) {
        const firstId = query.ids.split(',')[0] ?? 'missing';
        return ok({
          ...emptyPage().data,
          items: [item(firstId, { lifecycle: 'retired' })],
          nextCursor: null,
        });
      }

      return emptyPage();
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePlacementSources({ kind: 'items', ids: subjectIds }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.subjectItems).toHaveLength(2));

    const subjectCalls = mocks.webList.mock.calls.filter(
      ([request]) => request.query.ids !== undefined
    );
    expect(subjectCalls).toHaveLength(2);
    expect(mocks.webList).toHaveBeenCalledTimes(2);
    expect(result.current.subjectItemsQuery.data?.[0]?.fieldValues).toEqual([]);
    expect(subjectCalls.map(([request]) => request.query.ids.split(',').length)).toEqual([
      WEB_ITEMS_MAX_IDS,
      3,
    ]);
    expect(subjectCalls.every(([request]) => request.query.includeInactive === true)).toBe(true);
    expect(result.current.items.map((entry) => entry.id)).toEqual([
      'shared',
      'subject-0',
      `subject-${WEB_ITEMS_MAX_IDS}`,
    ]);
  });

  it('appends a created location to cached tree data and preserves it on failure', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => usePlacementSources({ kind: 'place', locationId: 'room' }),
      { wrapper: withQueryClient(client) }
    );

    await waitFor(() => expect(result.current.locationTree).toEqual([rootLocation]));
    await act(async () => {
      await result.current.createLocation.mutateAsync({
        name: 'New location',
        parentId: 'room',
      });
    });
    await waitFor(() => expect(result.current.createLocation.status).toBe('success'));
    expect(mocks.locationsCreate).toHaveBeenCalledWith({
      body: { name: 'New location', parentId: 'room', sortOrder: 0 },
    });

    const created = client.getQueryData<LocationTreeResponse>(LOCATION_TREE_QUERY_KEY);
    expect(created?.data[0]?.children).toEqual([
      {
        id: 'new-location',
        name: 'New location',
        parentId: 'room',
        sortOrder: 1,
        children: [],
      },
    ]);
    expect(mocks.locationsTree).toHaveBeenCalledTimes(1);

    const beforeFailure = client.getQueryData<LocationTreeResponse>(LOCATION_TREE_QUERY_KEY);
    mocks.locationsCreate.mockRejectedValueOnce(new Error('create failed'));
    await act(async () => {
      await expect(
        result.current.createLocation.mutateAsync({
          name: 'Broken location',
          parentId: 'room',
        })
      ).rejects.toThrow('create failed');
    });

    await waitFor(() => expect(result.current.createLocation.status).toBe('error'));
    expect(client.getQueryData<LocationTreeResponse>(LOCATION_TREE_QUERY_KEY)).toBe(beforeFailure);
  });

  it('keeps the placement world stable when its source data has not changed', async () => {
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(
      () => usePlacementSources({ kind: 'place', locationId: 'room' }),
      { wrapper: withQueryClient(client) }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const world = result.current.world;

    act(() => rerender());

    expect(result.current.world).toBe(world);
  });
});

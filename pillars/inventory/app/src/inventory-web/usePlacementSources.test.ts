import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WEB_ITEMS_MAX_IDS } from '@pops/inventory';

import { LOCATION_TREE_QUERY_KEY } from './queryKeys';
import { createTestQueryClient, withQueryClient } from './test-utils';

import type {
  LocationsTreeResponses,
  WebListData,
  WebListResponses,
} from '../inventory-api/types.gen.js';

const mocks = vi.hoisted(() => ({
  locationsCreate: vi.fn(),
  locationsTree: vi.fn(),
  typesReadCatalogue: vi.fn(),
  webList: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  locationsCreate: (...args: unknown[]) => mocks.locationsCreate(...args),
  locationsTree: (...args: unknown[]) => mocks.locationsTree(...args),
  typesReadCatalogue: (...args: unknown[]) => mocks.typesReadCatalogue(...args),
  webList: (...args: unknown[]) => mocks.webList(...args),
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
  mocks.webList.mockImplementation(async ({ query: _query }: { query: WebListData['query'] }) =>
    emptyPage()
  );
});

describe('usePlacementSources', () => {
  it('loads every active open and closed container page and passes recents through', async () => {
    mocks.webList.mockImplementation(async ({ query }: { query: WebListData['query'] }) => {
      if (query.access === 'open') {
        return query.cursor === undefined
          ? ok({
              ...emptyPage().data,
              items: [item('open-1')],
              nextCursor: 'open-next',
            })
          : ok({
              ...emptyPage().data,
              items: [item('open-2')],
              nextCursor: null,
            });
      }

      if (query.access === 'closed') {
        return query.cursor === undefined
          ? ok({
              ...emptyPage().data,
              items: [item('closed-1')],
              nextCursor: 'closed-next',
            })
          : ok({
              ...emptyPage().data,
              items: [item('closed-2')],
              nextCursor: null,
            });
      }

      return emptyPage();
    });
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => usePlacementSources({ kind: 'place', locationId: 'room' }),
      { wrapper: withQueryClient(client) }
    );

    await waitFor(() => expect(result.current.openContainers).toHaveLength(2));
    await waitFor(() => expect(result.current.closedContainers).toHaveLength(2));

    expect(mocks.webList).toHaveBeenCalledWith({
      query: {
        access: 'open',
        isContainer: 'true',
        cursor: undefined,
        limit: WEB_ITEMS_MAX_IDS,
      },
    });
    expect(mocks.webList).toHaveBeenCalledWith({
      query: {
        access: 'closed',
        isContainer: 'true',
        cursor: undefined,
        limit: WEB_ITEMS_MAX_IDS,
      },
    });
    expect(result.current.recents).toEqual([{ kind: 'location', locationId: 'recent-location' }]);
  });

  it('dedupes subject ids, chunks them at the contract limit, and includes inactive items', async () => {
    const ids = Array.from({ length: WEB_ITEMS_MAX_IDS + 2 }, (_, index) => `subject-${index}`);
    const subjectIds = [...ids, ids[0] ?? '', 'shared'];
    mocks.webList.mockImplementation(async ({ query }: { query: WebListData['query'] }) => {
      if (query.ids !== undefined) {
        const firstId = query.ids.split(',')[0] ?? 'missing';
        return ok({
          ...emptyPage().data,
          items: [item(firstId, { lifecycle: 'retired' })],
          nextCursor: null,
        });
      }

      if (query.access === 'open' || query.access === 'closed') {
        return ok({ ...emptyPage().data, items: [item('shared')] });
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
});

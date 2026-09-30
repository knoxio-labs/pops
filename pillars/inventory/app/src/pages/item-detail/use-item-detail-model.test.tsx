import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testField, testType } from '../../catalogue-editor/type-tree-test-utils';
import { buildWorld } from '../../foundation/model/placement-model';
import { InventoryApiError } from '../../inventory-api-helpers.js';
import { createTestQueryClient, withQueryClient } from '../../inventory-web/test-utils';
import { useItemDetailModel } from './use-item-detail-model';

import type { PickerSubject } from '../../foundation/model/contracts';
import type { ItemRowModel } from '../../foundation/model/model';
import type { PlacementWorld } from '../../foundation/model/placement-model';
import type { WebGetResponse } from '../../inventory-api/types.gen.js';
import type { WebEvent } from '../../inventory-web/useWebEvents.js';

const mocks = vi.hoisted(() => ({
  connectionsGraph: vi.fn(),
  documentsListForItem: vi.fn(),
  fixturesList: vi.fn(),
  fixturesListForItem: vi.fn(),
  paperlessStatus: vi.fn(),
  useCatalogueLookups: vi.fn(),
  usePendingItemIds: vi.fn(),
  usePlacementSources: vi.fn(),
  useWebEvents: vi.fn(),
  useWebItemDetail: vi.fn(),
}));

vi.mock('../../inventory-api/index.js', () => ({
  connectionsGraph: mocks.connectionsGraph,
  documentsListForItem: mocks.documentsListForItem,
  fixturesList: mocks.fixturesList,
  fixturesListForItem: mocks.fixturesListForItem,
  paperlessStatus: mocks.paperlessStatus,
}));

vi.mock('../../inventory-web/item-verbs.js', () => ({
  usePendingItemIds: mocks.usePendingItemIds,
}));

vi.mock('../../inventory-web/useCatalogueLookups.js', () => ({
  useCatalogueLookups: mocks.useCatalogueLookups,
}));

vi.mock('../../inventory-web/usePlacementSources.js', () => ({
  usePlacementSources: mocks.usePlacementSources,
}));

vi.mock('../../inventory-web/useWebEvents.js', () => ({
  useWebEvents: mocks.useWebEvents,
}));

vi.mock('../../inventory-web/useWebItemDetail.js', () => ({
  useWebItemDetail: mocks.useWebItemDetail,
}));

const item: ItemRowModel = {
  id: 'item-1',
  name: 'Desk lamp',
  typeId: null,
  typeName: null,
  code: null,
  quantity: 1,
  container: null,
  lifecycle: 'active',
  placement: { kind: 'location', locationId: 'study' },
  previous: null,
  sync: 'synced',
  photoUrl: null,
  note: null,
  updatedAt: '2026-09-01T00:00:00Z',
};

const readyWorld = buildWorld(
  [item],
  [{ id: 'study', name: 'Study', parentId: null, kind: 'room' }]
);
const emptyWorld = buildWorld([], []);

const webItem: WebGetResponse['item'] = {
  access: null,
  catalogueRevision: 1,
  code: null,
  computedValues: [],
  createdAt: '2026-09-01T00:00:00Z',
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
  name: 'Desk lamp',
  note: null,
  photos: [],
  placement: { kind: 'location', locationId: 'study' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-09-01T00:00:00Z',
};

const detailEvent: WebEvent = {
  actor: { kind: 'web', label: 'Web' },
  after: { name: 'Desk lamp' },
  before: { name: 'Lamp' },
  clientTime: null,
  compensatesSeq: null,
  entityId: 'item-1',
  entityKind: 'item',
  entityName: 'Desk lamp',
  fields: ['name'],
  kind: 'edited',
  reason: null,
  seq: 12,
  serverTime: '2026-09-02T12:00:00Z',
  undoable: false,
};

const success = (data: unknown) => ({
  data,
  error: undefined,
  response: new Response(null, { status: 200 }),
});

let primaryWorld: PlacementWorld;
let primaryError: Error | null;
let detailItem: WebGetResponse['item'] | null;
let detailError: unknown;
let detailRefetch: ReturnType<typeof vi.fn>;
type Refetch = () => Promise<unknown>;
let primaryLocationRefetch: Refetch;
let primarySubjectRefetch: Refetch;
let relatedLocationRefetch: Refetch;
let relatedSubjectRefetch: Refetch;

function source(
  world: PlacementWorld,
  error: Error | null,
  locationRefetch: Refetch,
  subjectItemsRefetch: Refetch
) {
  return {
    world,
    isLoading: false,
    isError: error !== null,
    error,
    locationsQuery: { refetch: locationRefetch },
    openContainersQuery: { refetch: locationRefetch },
    closedContainersQuery: { refetch: locationRefetch },
    subjectItemsQuery: { refetch: subjectItemsRefetch },
  };
}

function renderModel() {
  return renderHook(() => useItemDetailModel('item-1'), {
    wrapper: withQueryClient(createTestQueryClient()),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  primaryWorld = readyWorld;
  primaryError = null;
  detailItem = webItem;
  detailError = null;
  detailRefetch = vi.fn().mockResolvedValue({});
  primaryLocationRefetch = vi.fn<Refetch>().mockResolvedValue({});
  primarySubjectRefetch = vi.fn<Refetch>().mockResolvedValue({});
  relatedLocationRefetch = vi.fn<Refetch>().mockResolvedValue({});
  relatedSubjectRefetch = vi.fn<Refetch>().mockResolvedValue({});

  mocks.useCatalogueLookups.mockReturnValue({
    catalogue: undefined,
    types: [],
    typeById: new Map(),
    typeNameById: new Map(),
    typeForId: () => null,
    typeNameForId: () => null,
    isPending: false,
    error: null,
  });
  mocks.usePendingItemIds.mockReturnValue(new Set<string>());
  mocks.usePlacementSources.mockImplementation((subject: PickerSubject) => {
    const ids = subject.kind === 'items' ? subject.ids : [];
    return source(
      ids.includes('item-1') ? primaryWorld : emptyWorld,
      primaryError,
      ids.includes('item-1') ? primaryLocationRefetch : relatedLocationRefetch,
      ids.includes('item-1') ? primarySubjectRefetch : relatedSubjectRefetch
    );
  });
  mocks.useWebEvents.mockReturnValue({
    events: [],
    kindCounts: {},
    total: 0,
    status: 'success',
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  });
  mocks.useWebItemDetail.mockImplementation(() => ({
    data: detailItem === null ? undefined : { item: detailItem },
    error: detailError,
    refetch: detailRefetch,
  }));
  mocks.connectionsGraph.mockResolvedValue(success({ data: { edges: [], nodes: [] } }));
  mocks.documentsListForItem.mockResolvedValue(success({ data: [], total: 0 }));
  mocks.fixturesList.mockResolvedValue(success({ data: [], total: 0 }));
  mocks.fixturesListForItem.mockResolvedValue(success({ data: [], total: 0 }));
  mocks.paperlessStatus.mockResolvedValue(
    success({ data: { available: false, baseUrl: null, configured: false } })
  );
});

describe('useItemDetailModel', () => {
  it('includes the requested graph depth in its query key', () => {
    const queryClient = createTestQueryClient();
    renderHook(() => useItemDetailModel('item-1'), {
      wrapper: withQueryClient(queryClient),
    });

    expect(
      queryClient.getQueryCache().find({
        queryKey: ['inventory', 'connections', 'graph', { itemId: 'item-1', maxDepth: 10 }],
      })
    ).toBeDefined();
    expect(mocks.connectionsGraph).toHaveBeenCalledWith(
      expect.objectContaining({ query: { maxDepth: 10 } })
    );
  });

  it('resolves inherited facts and the computed type hierarchy path', async () => {
    const inherited = testField('field-material', 'type-bedding', 'material', {
      label: 'Material',
    });
    const local = testField('field-fitted', 'type-sheet', 'fitted', {
      kind: 'boolean',
      label: 'Fitted',
    });
    const parent = {
      ...testType('type-bedding', 'Bedding', null, { fields: [inherited] }),
      capabilities: [],
    };
    const child = testType('type-sheet', 'Sheet', parent.id, { fields: [local] });
    const types = [parent, child];
    const typeById = new Map<string, (typeof types)[number]>();
    const typeNameById = new Map<string, string>();
    for (const type of types) {
      typeById.set(type.id, type);
      typeNameById.set(type.id, type.label);
    }
    const typedItem = { ...item, typeId: child.id, typeName: child.label };
    primaryWorld = buildWorld(
      [typedItem],
      [{ id: 'study', name: 'Study', parentId: null, kind: 'room' }]
    );
    detailItem = {
      ...webItem,
      typeId: child.id,
      typeKey: child.key,
      fieldValues: [
        { catalogueRevision: 1, fieldId: inherited.id, source: 'stored', values: ['Cotton'] },
        { catalogueRevision: 1, fieldId: local.id, source: 'stored', values: [true] },
      ],
    };
    mocks.useCatalogueLookups.mockReturnValue({
      catalogue: undefined,
      types,
      typeById,
      typeNameById,
      typeForId: (id: string | null | undefined) =>
        id === null || id === undefined ? null : (typeById.get(id) ?? null),
      typeNameForId: (id: string | null | undefined) =>
        id === null || id === undefined ? null : (typeById.get(id)?.label ?? null),
      isPending: false,
      error: null,
    });

    const hook = renderModel();

    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.model?.item.typeName).toBe('Bedding › Sheet');
    expect(hook.result.current.model?.aggregate?.facts.map((fact) => fact.key)).toEqual([
      'material',
      'fitted',
    ]);
  });

  it('waits for the primary placement before becoming ready', async () => {
    primaryWorld = emptyWorld;
    const hook = renderModel();

    expect(hook.result.current.status).toBe('loading');
    primaryWorld = readyWorld;
    hook.rerender();

    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.model?.aggregate).not.toBeNull();
  });

  it('keeps the aggregate null while the web detail read is pending', async () => {
    detailItem = null;
    const hook = renderModel();

    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.model?.aggregate).toBeNull();
  });

  it('maps server events into the detail history model', async () => {
    mocks.useWebEvents.mockReturnValue({
      events: [detailEvent],
      kindCounts: { edited: 1 },
      total: 1,
      status: 'success',
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    });

    const hook = renderModel();

    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    expect(hook.result.current.model?.events).toEqual([
      expect.objectContaining({
        id: '12',
        itemId: 'item-1',
        kind: 'field-changed',
        summary: 'Renamed to Desk lamp',
        actorName: 'Web',
      }),
    ]);
  });

  it('exposes a not-found state for a detail 404 before placement resolves', () => {
    primaryWorld = emptyWorld;
    detailItem = null;
    detailError = new InventoryApiError('missing', 404);

    const hook = renderModel();

    expect(hook.result.current.status).toBe('not-found');
    expect(hook.result.current.model).toBeNull();
  });

  it('exposes an error state and retries the independent reads', async () => {
    primaryWorld = emptyWorld;
    primaryError = new Error('offline');
    const hook = renderModel();

    expect(hook.result.current.status).toBe('error');
    hook.result.current.retry();

    await waitFor(() => expect(detailRefetch).toHaveBeenCalledOnce());
    expect(relatedLocationRefetch).toHaveBeenCalledTimes(3);
    expect(relatedSubjectRefetch).toHaveBeenCalledOnce();
    expect(mocks.connectionsGraph).toHaveBeenCalledWith(
      expect.objectContaining({ query: { maxDepth: 10 } })
    );
  });

  it('uses the generic banner for a non-network auxiliary read error', async () => {
    mocks.documentsListForItem.mockRejectedValue(new InventoryApiError('invalid request', 400));

    const hook = renderModel();

    await waitFor(() => expect(hook.result.current.banner).toBe('error'));
    expect(hook.result.current.banner).not.toBe('unavailable');
  });
});

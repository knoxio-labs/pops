import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../foundation/model/placement-model';
import { InventoryApiError } from '../../inventory-api-helpers.js';
import { createTestQueryClient, withQueryClient } from '../../inventory-web/test-utils';
import { useItemDetailModel } from './use-item-detail-model';

import type { PickerSubject } from '../../foundation/model/contracts';
import type { ItemRowModel } from '../../foundation/model/model';
import type { PlacementWorld } from '../../foundation/model/placement-model';
import type { WebGetResponse } from '../../inventory-api/types.gen.js';

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
const relatedRefetch = vi.fn<Refetch>().mockResolvedValue({});

function source(world: PlacementWorld, error: Error | null, subjectRefetch?: Refetch) {
  const refetch = vi.fn<Refetch>().mockResolvedValue({});
  const subject = subjectRefetch ?? refetch;
  return {
    world,
    isLoading: false,
    isError: error !== null,
    error,
    locationsQuery: { refetch },
    openContainersQuery: { refetch },
    closedContainersQuery: { refetch },
    subjectItemsQuery: { refetch: subject },
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
      ids.includes('item-1') ? undefined : relatedRefetch
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
    expect(relatedRefetch).toHaveBeenCalledOnce();
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

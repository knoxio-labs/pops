import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  typesReadCatalogue: vi.fn(),
  webList: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  typesReadCatalogue: (...args: unknown[]) => mocks.typesReadCatalogue(...args),
  webList: (...args: unknown[]) => mocks.webList(...args),
}));

import { createTestQueryClient, withQueryClient } from './test-utils';
import { useItemRows, useWebItems } from './useWebItems';

import type {
  TypesReadCatalogueResponses,
  WebListData,
  WebListResponses,
} from '../inventory-api/types.gen.js';

type WebItem = WebListResponses['200']['items'][number];
type Catalogue = TypesReadCatalogueResponses[200];
type WebListPage = WebListResponses['200'] & {
  readonly deletedPreviousPlaces?: Readonly<
    Record<string, { readonly kind: 'location' | 'container'; readonly name: string }>
  >;
};

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

function item(id: string, overrides: Partial<WebItem> = {}): WebItem {
  return { ...baseItem, ...overrides, id, name: overrides.name ?? id };
}

function page(overrides: Partial<WebListPage> = {}): WebListPage {
  return {
    contentCounts: {},
    hiddenInactiveCount: 0,
    items: [],
    nextCursor: null,
    total: 0,
    unfilteredTotal: 0,
    ...overrides,
  };
}

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } };
}

type OkResponse<T> = ReturnType<typeof ok<T>>;

function deferred<T>() {
  let resolvePromise: ((value: T | PromiseLike<T>) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error('Promise resolver is not ready');
      resolvePromise(value);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.typesReadCatalogue.mockResolvedValue(ok(catalogue));
});

describe('useWebItems', () => {
  it('fetches the first page with the given filters and default limit', async () => {
    mocks.webList.mockResolvedValue(ok({ items: [{ id: 'a' }], nextCursor: null }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebItems({ typeKey: 'cable' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.webList).toHaveBeenCalledWith({
      query: { typeKey: 'cable', limit: 50, cursor: undefined },
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data?.pages[0]?.items).toEqual([{ id: 'a' }]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('requests the next page using the previous page nextCursor', async () => {
    mocks.webList
      .mockResolvedValueOnce(ok({ items: [{ id: 'a' }], nextCursor: 'cursor-1' }))
      .mockResolvedValueOnce(ok({ items: [{ id: 'b' }], nextCursor: null }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useWebItems({}), { wrapper: withQueryClient(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mocks.webList).toHaveBeenLastCalledWith({
      query: { limit: 50, cursor: 'cursor-1' },
      signal: expect.any(AbortSignal),
    });
    expect(result.current.hasNextPage).toBe(false);
  });

  it('resets pagination when filters change (a new query key)', async () => {
    mocks.webList.mockResolvedValue(ok({ items: [], nextCursor: null }));
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(({ typeKey }) => useWebItems({ typeKey }), {
      wrapper: withQueryClient(client),
      initialProps: { typeKey: 'cable' as string | undefined },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ typeKey: 'bulb' });
    await waitFor(() =>
      expect(mocks.webList).toHaveBeenLastCalledWith({
        query: { typeKey: 'bulb', limit: 50, cursor: undefined },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('maps web items to row models and exposes first-page totals', async () => {
    mocks.webList.mockResolvedValue(
      ok(
        page({
          items: [
            item('item-1', {
              access: 'open',
              code: 'CAB-1',
              isContainer: true,
              isFull: true,
              lifecycle: 'retired',
              name: 'Cable box',
              note: 'Short cable',
              placement: { kind: 'container', itemId: 'box-1' },
              previousPlacement: { kind: 'location', locationId: 'deleted-room' },
              quantity: 2,
              typeId: 'type-cable',
              typeKey: 'cable',
            }),
          ],
          total: 1,
          unfilteredTotal: 3,
          hiddenInactiveCount: 2,
          deletedPreviousPlaces: {
            'deleted-room': { kind: 'location', name: 'Old room' },
          },
        })
      )
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useItemRows({ typeKey: 'cable' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.rows[0]?.typeName).toBe('Cables'));

    expect(result.current.rows).toEqual([
      {
        id: 'item-1',
        name: 'Cable box',
        typeId: 'type-cable',
        typeName: 'Cables',
        code: 'CAB-1',
        quantity: 2,
        container: { access: 'open', full: true },
        lifecycle: 'retired',
        placement: { kind: 'container', containerId: 'box-1' },
        previous: { kind: 'deleted', name: 'Old room' },
        sync: 'synced',
        photoUrl: null,
        note: 'Short cable',
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
    ]);
    expect(result.current.total).toBe(1);
    expect(result.current.unfilteredTotal).toBe(3);
    expect(result.current.hiddenInactiveCount).toBe(2);
    expect(result.current.baseline).toBe(3);
    expect(result.current.hidden).toBe(2);
  });

  it('merges content counts from each loaded page', async () => {
    mocks.webList
      .mockResolvedValueOnce(
        ok(
          page({
            contentCounts: { 'box-a': { direct: 2, deep: 3 } },
            items: [item('box-a', { isContainer: true })],
            nextCursor: 'cursor-1',
          })
        )
      )
      .mockResolvedValueOnce(
        ok(
          page({
            contentCounts: { 'box-b': { direct: 1, deep: 1 } },
            items: [item('box-b', { isContainer: true })],
          })
        )
      );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useItemRows({ isContainer: 'true' }), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() =>
      expect(result.current.contentCounts).toEqual({
        'box-a': { direct: 2, deep: 3 },
      })
    );

    await result.current.fetchNextPage();

    await waitFor(() =>
      expect(result.current.contentCounts).toEqual({
        'box-a': { direct: 2, deep: 3 },
        'box-b': { direct: 1, deep: 1 },
      })
    );
  });

  it('exposes an empty content count map for an empty page', async () => {
    mocks.webList.mockResolvedValue(ok(page()));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useItemRows({}), {
      wrapper: withQueryClient(client),
    });

    await waitFor(() => expect(result.current.status).toBe('success'));

    expect(result.current.contentCounts).toEqual({});
  });

  it('aborts an in-flight request when its filters change', async () => {
    const first = deferred<OkResponse<WebListPage>>();
    const second = deferred<OkResponse<WebListPage>>();
    const requests: Array<{ query: WebListData['query']; signal: AbortSignal }> = [];
    mocks.webList.mockImplementation(
      ({ query, signal }: { query: WebListData['query']; signal: AbortSignal }) => {
        requests.push({ query, signal });
        return requests.length === 1 ? first.promise : second.promise;
      }
    );
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(
      ({ typeKey }: { typeKey: string }) => useWebItems({ typeKey }),
      {
        initialProps: { typeKey: 'cable' },
        wrapper: withQueryClient(client),
      }
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.signal.aborted).toBe(false);

    rerender({ typeKey: 'bulb' });

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(requests[1]).toMatchObject({
      query: { typeKey: 'bulb', limit: 50, cursor: undefined },
      signal: expect.any(AbortSignal),
    });

    await act(async () => {
      first.resolve(ok(page()));
      second.resolve(ok(page()));
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

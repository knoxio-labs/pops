import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemsListResponses } from '../../inventory-api/types.gen.js';

type ItemsListPage = ItemsListResponses['200'];
type InventoryItem = ItemsListPage['data'][number];

interface ItemsListCallOptions {
  query: { offset: number };
  signal: AbortSignal;
}
type ItemsListMock = (options: ItemsListCallOptions) => Promise<{ data: ItemsListPage }>;

const mocks = vi.hoisted(() => ({ itemsList: vi.fn<ItemsListMock>() }));

vi.mock('../../inventory-api/index.js', () => ({
  itemsList: (options: ItemsListCallOptions) => mocks.itemsList(options),
}));

const { fetchAllItemPages } = await import('./fetchAllItemPages');

function item(id: string): InventoryItem {
  return {
    assetId: null,
    brand: null,
    condition: null,
    containerId: null,
    deductible: false,
    id,
    inUse: null,
    itemId: null,
    itemName: id,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    location: null,
    locationId: null,
    model: null,
    notes: null,
    purchaseDate: null,
    purchasePrice: null,
    purchaseTransactionId: null,
    purchasedFromId: null,
    purchasedFromName: null,
    replacementValue: null,
    resaleValue: null,
    room: null,
    type: null,
    warrantyExpires: null,
  };
}

function page(
  data: InventoryItem[],
  pagination: ItemsListPage['pagination']
): { data: ItemsListPage } {
  return {
    data: { data, pagination, totals: { totalReplacementValue: 0, totalResaleValue: 0 } },
  };
}

const QUERY_INPUT = {
  search: undefined,
  type: undefined,
  condition: undefined,
  inUse: undefined,
  locationId: undefined,
  limit: 200,
};

describe('fetchAllItemPages', () => {
  beforeEach(() => {
    mocks.itemsList.mockReset();
  });

  it('walks offset forward until hasMore is false and assembles every row', async () => {
    mocks.itemsList
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 200 }, (_, i) => item(`a${i}`)),
          { total: 450, limit: 200, offset: 0, hasMore: true }
        )
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 200 }, (_, i) => item(`b${i}`)),
          { total: 450, limit: 200, offset: 200, hasMore: true }
        )
      )
      .mockResolvedValueOnce(
        page(
          Array.from({ length: 50 }, (_, i) => item(`c${i}`)),
          { total: 450, limit: 200, offset: 400, hasMore: false }
        )
      );

    const result = await fetchAllItemPages(QUERY_INPUT, new AbortController().signal);

    expect(result.data).toHaveLength(450);
    expect(result.pagination).toEqual({ total: 450, limit: 200, offset: 400, hasMore: false });
    expect(mocks.itemsList).toHaveBeenCalledTimes(3);
    expect(mocks.itemsList.mock.calls.map(([opts]) => opts.query.offset)).toEqual([0, 200, 400]);
  });

  it('stops after the first page when hasMore is already false', async () => {
    mocks.itemsList.mockResolvedValueOnce(
      page([item('only')], { total: 1, limit: 200, offset: 0, hasMore: false })
    );

    const result = await fetchAllItemPages(QUERY_INPUT, new AbortController().signal);

    expect(result.data).toHaveLength(1);
    expect(mocks.itemsList).toHaveBeenCalledTimes(1);
  });

  it('drops a row repeated across pages rather than duplicating it', async () => {
    mocks.itemsList
      .mockResolvedValueOnce(
        page([item('shared'), item('a')], { total: 3, limit: 200, offset: 0, hasMore: true })
      )
      .mockResolvedValueOnce(
        // A page overlap (e.g. a row moving under concurrent writes) repeats
        // an id already seen on the previous page.
        page([item('shared'), item('b')], { total: 3, limit: 200, offset: 200, hasMore: false })
      );

    const result = await fetchAllItemPages(QUERY_INPUT, new AbortController().signal);

    expect(result.data.map((row) => row.id)).toEqual(['shared', 'a', 'b']);
  });

  it('is bounded: a server that always reports hasMore stops instead of paging forever', async () => {
    mocks.itemsList.mockImplementation(async ({ query }) =>
      page([item(`row-${query.offset}`)], {
        total: Number.MAX_SAFE_INTEGER,
        limit: 200,
        offset: query.offset,
        hasMore: true,
      })
    );

    const result = await fetchAllItemPages(QUERY_INPUT, new AbortController().signal);

    expect(mocks.itemsList).toHaveBeenCalledTimes(500);
    expect(result.data).toHaveLength(500);
  });

  it('retries the whole walk once when the total changes mid-walk, then returns the stable retry', async () => {
    mocks.itemsList
      // Attempt 1: total shifts from 450 to 449 between pages — a delete
      // raced the walk, so this attempt is discarded.
      .mockResolvedValueOnce(
        page([item('a')], { total: 450, limit: 200, offset: 0, hasMore: true })
      )
      .mockResolvedValueOnce(
        page([item('b')], { total: 449, limit: 200, offset: 200, hasMore: true })
      )
      .mockResolvedValueOnce(
        page([item('c')], { total: 449, limit: 200, offset: 400, hasMore: false })
      )
      // Attempt 2: nothing changes size mid-walk — kept.
      .mockResolvedValueOnce(
        page([item('x')], { total: 449, limit: 200, offset: 0, hasMore: true })
      )
      .mockResolvedValueOnce(
        page([item('y')], { total: 449, limit: 200, offset: 200, hasMore: true })
      )
      .mockResolvedValueOnce(
        page([item('z')], { total: 449, limit: 200, offset: 400, hasMore: false })
      );

    const result = await fetchAllItemPages(QUERY_INPUT, new AbortController().signal);

    expect(mocks.itemsList).toHaveBeenCalledTimes(6);
    expect(result.data.map((row) => row.id)).toEqual(['x', 'y', 'z']);
    expect(result.pagination.total).toBe(449);
  });

  it('gives up after the bounded number of attempts rather than retrying forever under sustained drift', async () => {
    let counter = 0;
    mocks.itemsList.mockImplementation(async ({ query }) => {
      counter += 1;
      // A strictly increasing total on every single call guarantees a
      // mismatch between any two calls of the same walk, so every attempt
      // sees drift.
      return page([item(`p${counter}`)], {
        total: counter,
        limit: 200,
        offset: query.offset,
        hasMore: query.offset === 0,
      });
    });

    const result = await fetchAllItemPages(QUERY_INPUT, new AbortController().signal);

    // 3 attempts (MAX_CONSISTENCY_ATTEMPTS) of 2 calls each, then it stops
    // trying and returns the last attempt's best-effort assembly.
    expect(mocks.itemsList).toHaveBeenCalledTimes(6);
    expect(result.data.map((row) => row.id)).toEqual(['p5', 'p6']);
  });

  it('propagates an abort instead of issuing the next page', async () => {
    const controller = new AbortController();
    mocks.itemsList
      .mockResolvedValueOnce(page([item('a')], { total: 2, limit: 200, offset: 0, hasMore: true }))
      .mockImplementationOnce(async ({ signal }) => {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        return page([item('b')], { total: 2, limit: 200, offset: 200, hasMore: false });
      });

    const promise = fetchAllItemPages(QUERY_INPUT, controller.signal);
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.itemsList).toHaveBeenCalledTimes(2);
  });
});

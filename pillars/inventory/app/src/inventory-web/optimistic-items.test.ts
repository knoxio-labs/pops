import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { optimisticItemsFor } from './optimistic-items.js';
import {
  PLACEMENT_SOURCES_QUERY_KEY,
  WEB_ITEMS_QUERY_KEY,
  webItemDetailQueryKey,
} from './queryKeys.js';
import { WEB_SEARCH_QUERY_KEY } from './useWebSearch.js';

import type {
  WebListResponses,
  WebGetResponses,
  WebSearchListResponses,
  WebPlacementSourcesResponses,
} from '../inventory-api/types.gen.js';

type WebItem = WebListResponses['200']['items'][number];
type WebListPage = WebListResponses['200'];
type WebDetail = WebGetResponses['200'];
type WebSearchPage = WebSearchListResponses['200'];
type PlacementSource = WebPlacementSourcesResponses[200]['items'][number];

const baseItem: WebItem = {
  access: null,
  catalogueRevision: null,
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
  placement: { kind: 'location', locationId: 'old-room' },
  previousPlacement: null,
  provenance: null,
  quantity: 1,
  revision: 1,
  seq: 1,
  typeId: null,
  typeKey: null,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function item(id: string, overrides: Partial<WebItem> = {}): WebItem {
  return { ...baseItem, ...overrides, id };
}

function containerSource(): PlacementSource {
  return {
    access: 'closed',
    code: 'BOX',
    id: 'item-1',
    isContainer: true,
    isFull: false,
    legacyType: null,
    lifecycle: 'active',
    name: 'Container',
    note: null,
    placement: { kind: 'location', locationId: 'old-room' },
    previousPlacement: null,
    quantity: 1,
    typeId: null,
    typeKey: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function listPage(items: readonly WebItem[]): WebListPage {
  return {
    contentCounts: {},
    hiddenInactiveCount: 0,
    items: [...items],
    nextCursor: null,
    total: items.length,
    unfilteredTotal: items.length,
  };
}

function detailPage(value: WebItem): WebDetail {
  return {
    item: value,
    history: { events: [], nextCursor: null },
  };
}

function searchPage(value: WebItem): WebSearchPage {
  return {
    exact: value,
    items: [{ item: value, tier: 'prefix', field: null }],
    nextCursor: null,
    places: [],
    total: 1,
  };
}

function seedCaches(queryClient: QueryClient, value: WebItem): void {
  queryClient.setQueryData([...WEB_ITEMS_QUERY_KEY, 'list', { sort: 'name' }, 50], {
    pages: [listPage([value])],
    pageParams: [undefined],
  });
  queryClient.setQueryData([...WEB_ITEMS_QUERY_KEY, 'placement-containers'], [value]);
  queryClient.setQueryData([...WEB_ITEMS_QUERY_KEY, 'placement-subjects'], [value]);
  queryClient.setQueryData([...PLACEMENT_SOURCES_QUERY_KEY, 'containers', 'open'], [value]);
  queryClient.setQueryData([...webItemDetailQueryKey(value.id), 50], detailPage(value));
  queryClient.setQueryData([...webItemDetailQueryKey(value.id), 'history', 50], {
    pages: [detailPage(value)],
    pageParams: [undefined],
  });
  queryClient.setQueryData([...WEB_SEARCH_QUERY_KEY, { q: value.name }], {
    pages: [searchPage(value)],
    pageParams: [undefined],
  });
}

function cachedItem(queryClient: QueryClient, key: readonly unknown[]): WebItem {
  const direct = queryClient.getQueryData<readonly WebItem[]>(key);
  if (direct?.[0] !== undefined) return direct[0];
  const data = queryClient.getQueryData<{ item: WebItem }>(key);
  if (data?.item !== undefined) return data.item;
  const pages = queryClient.getQueryData<{ pages: readonly unknown[] }>(key)?.pages;
  const first = pages?.[0];
  if (Array.isArray(first)) return first[0] as WebItem;
  if (typeof first === 'object' && first !== null && 'items' in first) {
    const items = first.items;
    if (Array.isArray(items)) return items[0] as WebItem;
  }
  if (typeof first === 'object' && first !== null && 'item' in first) {
    return first.item as WebItem;
  }
  throw new Error('test cache did not contain an item');
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('optimisticItemsFor', () => {
  it('does not use a lightweight container as a mutation base', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData([...PLACEMENT_SOURCES_QUERY_KEY, 'containers'], [containerSource()]);
    const optimistic = optimisticItemsFor(queryClient);

    expect(() => optimistic.displayed('item-1')).toThrow('item item-1 is not loaded');
    expect(() => optimistic.baseRevision('item-1')).toThrow('item item-1 is not loaded');
    expect(() => optimistic.begin('item-1', (value) => ({ ...value, name: 'Changed' }))).toThrow(
      'item item-1 is not loaded'
    );
  });

  it('uses full revisions loaded after placement sources and keeps optimistic projections lightweight', () => {
    const queryClient = new QueryClient();
    const source = containerSource();
    const sourceKey = [...PLACEMENT_SOURCES_QUERY_KEY, 'containers'];
    queryClient.setQueryData(sourceKey, [source]);
    const original = item('item-1', { ...source, revision: 7, seq: 11 });
    queryClient.setQueryData([...webItemDetailQueryKey('item-1'), 50], detailPage(original));
    const newest = { ...original, revision: 8, seq: 12, note: 'Newest note' };
    queryClient.setQueryData([...WEB_ITEMS_QUERY_KEY, 'list', { sort: 'name' }, 50], {
      pages: [listPage([newest])],
      pageParams: [undefined],
    });
    const optimistic = optimisticItemsFor(queryClient);
    expect(optimistic.displayed('item-1')).toEqual(newest);
    expect(optimistic.baseRevision('item-1')).toBe(8);

    const token = optimistic.begin('item-1', (value) => ({ ...value, name: 'Changed' }));

    expect(optimistic.displayed('item-1').fieldValues).toEqual([]);
    expect(optimistic.displayed('item-1').computedValues).toEqual([]);
    expect(queryClient.getQueryData(sourceKey)).toEqual([
      { ...source, name: 'Changed', note: 'Newest note' },
    ]);

    optimistic.refuse('item-1', token);
    expect(queryClient.getQueryData(sourceKey)).toEqual([{ ...source, note: 'Newest note' }]);
    const nextToken = optimistic.begin('item-1', (value) => ({ ...value, name: 'Accepted' }));
    optimistic.acknowledge('item-1', nextToken, { revision: 9, seq: 13 });
    expect(optimistic.baseRevision('item-1')).toBe(9);
    expect(queryClient.getQueryData(sourceKey)).toEqual([
      { ...source, name: 'Accepted', note: 'Newest note' },
    ]);
  });

  it('begin patches every list, placement, detail and history cache copy', () => {
    const queryClient = new QueryClient();
    const original = item('item-1');
    seedCaches(queryClient, original);
    const optimistic = optimisticItemsFor(queryClient);

    optimistic.begin('item-1', (value) => ({ ...value, name: 'Changed' }));

    expect(optimistic.displayed('item-1').name).toBe('Changed');
    expect(cachedItem(queryClient, [...WEB_ITEMS_QUERY_KEY, 'placement-containers']).name).toBe(
      'Changed'
    );
    expect(cachedItem(queryClient, [...webItemDetailQueryKey('item-1'), 50]).name).toBe('Changed');
    expect(cachedItem(queryClient, [...webItemDetailQueryKey('item-1'), 'history', 50]).name).toBe(
      'Changed'
    );
  });

  it('patches the exact hit and item hits on every cached search page', () => {
    const queryClient = new QueryClient();
    const original = item('item-1');
    queryClient.setQueryData([...WEB_SEARCH_QUERY_KEY, { q: 'item' }], {
      pages: [searchPage(original), { ...searchPage(original), exact: null }],
      pageParams: [undefined, 'cursor'],
    });
    const optimistic = optimisticItemsFor(queryClient);

    optimistic.begin('item-1', (value) => ({ ...value, code: 'NEW' }));

    const data = queryClient.getQueryData<{
      pages: readonly WebSearchPage[];
    }>([...WEB_SEARCH_QUERY_KEY, { q: 'item' }]);
    expect(data?.pages[0]?.exact?.code).toBe('NEW');
    expect(data?.pages[0]?.items[0]?.item.code).toBe('NEW');
    expect(data?.pages[1]?.items[0]?.item.code).toBe('NEW');
  });

  it('acknowledge folds the patch into the acknowledged copy and revision', () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient, item('item-1', { quantity: 2 }));
    const optimistic = optimisticItemsFor(queryClient);
    const token = optimistic.begin('item-1', (value) => ({ ...value, quantity: 5 }));

    optimistic.acknowledge('item-1', token, { revision: 2, seq: 17 });

    expect(optimistic.displayed('item-1')).toMatchObject({ quantity: 5, revision: 2, seq: 17 });
    expect(optimistic.baseRevision('item-1')).toBe(2);
  });

  it('refuse restores the acknowledged copy while retaining later patches', () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient, item('item-1', { name: 'Original', note: null }));
    const optimistic = optimisticItemsFor(queryClient);
    const first = optimistic.begin('item-1', (value) => ({ ...value, name: 'Refused' }));
    optimistic.begin('item-1', (value) => ({ ...value, note: 'Later' }));

    optimistic.refuse('item-1', first);

    expect(optimistic.displayed('item-1')).toMatchObject({ name: 'Original', note: 'Later' });
    optimistic.refuse('item-1', 2);
    expect(optimistic.displayed('item-1')).toMatchObject({ name: 'Original', note: null });
  });

  it('overwrites an equal-revision refetch with the displayed copy', () => {
    const queryClient = new QueryClient();
    const original = item('item-1', { note: 'Original' });
    const listKey = [...WEB_ITEMS_QUERY_KEY, 'list', { sort: 'name' }, 50] as const;
    queryClient.setQueryData(listKey, {
      pages: [listPage([original])],
      pageParams: [undefined],
    });
    const optimistic = optimisticItemsFor(queryClient);
    optimistic.begin('item-1', (value) => ({ ...value, name: 'Local' }));

    queryClient.setQueryData(listKey, {
      pages: [listPage([item('item-1', { note: 'Refetched', revision: 1, seq: 1 })])],
      pageParams: [undefined],
    });

    expect(optimistic.displayed('item-1')).toMatchObject({ name: 'Local', note: 'Original' });
  });

  it('uses the highest cached revision as the base when nothing is pending', () => {
    const queryClient = new QueryClient();
    const stale = item('item-1', { revision: 3, seq: 3 });
    const fresh = item('item-1', { revision: 5, seq: 5 });
    queryClient.setQueryData([...WEB_ITEMS_QUERY_KEY, 'list', { sort: 'name' }, 50], {
      pages: [listPage([stale])],
      pageParams: [undefined],
    });
    queryClient.setQueryData([...webItemDetailQueryKey('item-1'), 50], detailPage(fresh));

    expect(optimisticItemsFor(queryClient).baseRevision('item-1')).toBe(5);
  });

  it('rebases pending patches over a newer refetched server copy', () => {
    const queryClient = new QueryClient();
    const original = item('item-1', { name: 'Original', note: 'Keep' });
    const listKey = [...WEB_ITEMS_QUERY_KEY, 'list', { sort: 'name' }, 50] as const;
    const detailKey = [...webItemDetailQueryKey('item-1'), 50] as const;
    queryClient.setQueryData(listKey, {
      pages: [listPage([original])],
      pageParams: [undefined],
    });
    queryClient.setQueryData(detailKey, detailPage(original));
    const optimistic = optimisticItemsFor(queryClient);
    optimistic.begin('item-1', (value) => ({ ...value, name: 'Local' }));

    queryClient.setQueryData(
      detailKey,
      detailPage(item('item-1', { name: 'Remote', note: 'Remote update', revision: 2, seq: 9 }))
    );

    expect(optimistic.displayed('item-1')).toMatchObject({
      name: 'Local',
      note: 'Remote update',
      revision: 2,
      seq: 9,
    });
    expect(cachedItem(queryClient, listKey).name).toBe('Local');
  });

  it('invalidates web queries once when the last pending patch settles', () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient, item('item-1'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const optimistic = optimisticItemsFor(queryClient);
    const first = optimistic.begin('item-1', (value) => ({ ...value, name: 'First' }));
    const second = optimistic.begin('item-1', (value) => ({ ...value, note: 'Second' }));

    optimistic.acknowledge('item-1', first, { revision: 2, seq: 2 });
    expect(invalidate).not.toHaveBeenCalled();
    optimistic.acknowledge('item-1', second, { revision: 3, seq: 3 });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'web'] });
  });

  it('defers held invalidations into one release call', () => {
    const queryClient = new QueryClient();
    seedCaches(queryClient, item('item-1'));
    seedCaches(queryClient, item('item-2'));
    seedCaches(queryClient, item('item-3'));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    const optimistic = optimisticItemsFor(queryClient);
    const release = optimistic.holdInvalidation();

    const tokens = ['item-1', 'item-2', 'item-3'].map((id) =>
      optimistic.begin(id, (value) => value)
    );
    tokens.forEach((token, index) => {
      const id = `item-${index + 1}`;
      optimistic.acknowledge(id, token, { revision: 2, seq: index + 2 });
    });

    expect(invalidate).not.toHaveBeenCalled();
    release();
    release();
    expect(invalidate).toHaveBeenCalledTimes(1);

    const noWorkRelease = optimistic.holdInvalidation();
    noWorkRelease();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it.each(['open', 'closed'] as const)(
    'does not rewrite pending %s access when query observers change',
    (access) => {
      const queryClient = new QueryClient();
      seedCaches(
        queryClient,
        item('item-1', { isContainer: true, access: access === 'open' ? 'closed' : 'open' })
      );
      const optimistic = optimisticItemsFor(queryClient);
      const token = optimistic.begin('item-1', (value) => ({ ...value, access }));
      const write = vi.spyOn(queryClient, 'setQueriesData');
      const observer = new QueryObserver(queryClient, {
        queryKey: [...webItemDetailQueryKey('item-1'), 50],
        enabled: false,
      });
      const unsubscribe = observer.subscribe(() => undefined);
      observer.setOptions({
        queryKey: [...webItemDetailQueryKey('item-1'), 50],
        enabled: false,
        staleTime: Infinity,
      });
      unsubscribe();

      expect(write).not.toHaveBeenCalled();
      expect(optimistic.displayed('item-1').access).toBe(access);
      optimistic.refuse('item-1', token);
      expect(optimistic.displayed('item-1').access).toBe(access === 'open' ? 'closed' : 'open');
    }
  );

  it('throws when displayed has no cached item', () => {
    const optimistic = optimisticItemsFor(new QueryClient());

    expect(() => optimistic.displayed('missing')).toThrow('item missing is not loaded');
  });
});

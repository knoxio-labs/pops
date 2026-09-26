import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { InventoryApiError, unwrap } from '../inventory-api-helpers.js';
import { client } from '../inventory-api/client.gen.js';
import * as inventoryApi from '../inventory-api/index.js';
import { toItemRowModel } from './item-row-model.js';
import { useCatalogueLookups } from './useCatalogueLookups.js';

import type { ItemRowModel } from '../foundation/model/model';
import type {
  FixturesListData,
  FixturesListResponse,
  WebListResponses,
} from '../inventory-api/types.gen.js';

/** The cache-key root for the paged fixture list. */
export const FIXTURES_LIST_QUERY_KEY = ['inventory', 'fixtures', 'list'] as const;

/** One fixture row returned by `GET /fixtures`. */
export type FixtureListRow = FixturesListResponse['data'][number];

/** The server-side filters accepted by the fixture list. */
export interface FixturesFilter {
  readonly search: string;
  readonly type: string | null;
  readonly withinLocationId: string | null;
}

/** Paged fixture rows and controls for the Fixtures page. */
export interface FixturesList {
  readonly rows: FixtureListRow[];
  readonly total: number | null;
  readonly status: 'pending' | 'error' | 'success';
  readonly error: InventoryApiError | null;
  readonly hasNextPage: boolean;
  readonly fetchNextPage: () => void;
  readonly refetch: () => void;
}

/** The query key for one fixture's wired-item list. */
export function fixtureItemsQueryKey(
  fixtureId: string
): readonly ['inventory', 'fixtures', 'items', string] {
  return ['inventory', 'fixtures', 'items', fixtureId];
}

const FIXTURE_PAGE_LIMIT = 50;
const EMPTY_FIXTURE_PAGES: readonly FixtureListPage[] = [];
const EMPTY_ITEM_PAGES: readonly FixtureItemsPage[] = [];
const EMPTY_DELETED_PREVIOUS_PLACES = new Map<string, string>();

type FixtureListPage = FixturesListResponse & { readonly offset: number };
type FixtureListQuery = NonNullable<FixturesListData['query']> & {
  search?: string;
  withinLocationId?: string;
};
type FixtureItem = WebListResponses['200']['items'][number];
type FixtureItemsPagination = { hasMore: boolean; limit: number; offset: number; total: number };
type FixtureItemsPage = {
  data: FixtureItem[];
  pagination: FixtureItemsPagination;
  requestOffset: number;
};
type FixtureItemsResult = {
  data?: { data: FixtureItem[]; pagination: FixtureItemsPagination };
  error?: unknown;
  response?: Response;
};
type FixtureItemsOptions = {
  path: { fixtureId: string };
  query: { limit: number; offset: number };
  signal?: AbortSignal;
};
type FixtureItemsList = (options: FixtureItemsOptions) => Promise<FixtureItemsResult>;
type InventoryApiWithFixtureItems = typeof inventoryApi & {
  readonly fixturesListItems?: FixtureItemsList;
};
type FixtureItemsResponses = { 200: { data: FixtureItem[]; pagination: FixtureItemsPagination } };
const inventoryApiWithFixtureItems: InventoryApiWithFixtureItems = inventoryApi;

function fixtureListQuery(filter: FixturesFilter, offset: number): FixtureListQuery {
  const query: FixtureListQuery = { limit: FIXTURE_PAGE_LIMIT, offset };
  const search = filter.search.trim();
  if (search.length > 0) query.search = search;
  if (filter.type !== null) query.type = filter.type;
  if (filter.withinLocationId !== null) query.withinLocationId = filter.withinLocationId;
  return query;
}

function fixtureItemsList(options: FixtureItemsOptions): Promise<FixtureItemsResult> {
  const listItems = inventoryApiWithFixtureItems.fixturesListItems;
  if (listItems !== undefined) return listItems(options);
  return client.get<FixtureItemsResponses, unknown>({
    url: '/fixtures/{fixtureId}/items',
    path: options.path,
    query: options.query,
    signal: options.signal,
  });
}

function nextOffset(page: {
  readonly offset: number;
  readonly dataLength: number;
  readonly total: number;
}): number | undefined {
  const offset = page.offset + page.dataLength;
  return page.dataLength > 0 && offset < page.total ? offset : undefined;
}

/** Reads the offset-paged fixture list without client-side filtering or sorting. */
export function useFixtures(filter: FixturesFilter): FixturesList {
  const query = useInfiniteQuery({
    queryKey: [
      ...FIXTURES_LIST_QUERY_KEY,
      {
        search: filter.search.trim(),
        type: filter.type,
        withinLocationId: filter.withinLocationId,
      },
    ] as const,
    queryFn: async ({ pageParam, signal }) => {
      const page = unwrap(
        await inventoryApi.fixturesList({
          query: fixtureListQuery(filter, pageParam),
          signal,
        })
      );
      return { ...page, offset: pageParam };
    },
    initialPageParam: 0,
    getNextPageParam: (page) =>
      nextOffset({
        offset: page.offset,
        dataLength: page.data.length,
        total: page.total,
      }),
    refetchOnWindowFocus: false,
  });
  const pages = query.data?.pages ?? EMPTY_FIXTURE_PAGES;
  const { fetchNextPage: fetchQueryNextPage, refetch: refetchQuery } = query;
  const fetchNextPage = useCallback((): void => {
    void fetchQueryNextPage();
  }, [fetchQueryNextPage]);
  const refetch = useCallback((): void => {
    void refetchQuery();
  }, [refetchQuery]);

  return {
    rows: pages.flatMap((page) => page.data),
    total: pages[0]?.total ?? null,
    status: query.status,
    error: query.error instanceof InventoryApiError ? query.error : null,
    hasNextPage: query.hasNextPage,
    fetchNextPage,
    refetch,
  };
}

/** Reads and maps every item wired to one fixture, preserving server paging and errors. */
export function useFixtureItems(fixtureId: string): {
  readonly items: ItemRowModel[];
  readonly total: number | null;
  readonly status: 'pending' | 'error' | 'success';
  readonly error: InventoryApiError | null;
  readonly hasNextPage: boolean;
  readonly fetchNextPage: () => void;
} {
  const { typeNameById } = useCatalogueLookups();
  const query = useInfiniteQuery({
    queryKey: fixtureItemsQueryKey(fixtureId),
    queryFn: async ({ pageParam, signal }) => {
      const page = unwrap(
        await fixtureItemsList({
          path: { fixtureId },
          query: { limit: FIXTURE_PAGE_LIMIT, offset: pageParam },
          signal,
        })
      );
      return { ...page, requestOffset: pageParam };
    },
    initialPageParam: 0,
    getNextPageParam: (page) =>
      nextOffset({
        offset: page.requestOffset,
        dataLength: page.data.length,
        total: page.pagination.total,
      }),
    refetchOnWindowFocus: false,
  });
  const pages = query.data?.pages ?? EMPTY_ITEM_PAGES;
  const items = useMemo(
    () =>
      pages.flatMap((page) =>
        page.data.map((item) =>
          toItemRowModel(item, {
            typeNames: typeNameById,
            deletedPreviousPlaces: EMPTY_DELETED_PREVIOUS_PLACES,
          })
        )
      ),
    [pages, typeNameById]
  );
  const { fetchNextPage: fetchQueryNextPage } = query;
  const fetchNextPage = useCallback((): void => {
    void fetchQueryNextPage();
  }, [fetchQueryNextPage]);

  return {
    items,
    total: pages[0]?.pagination.total ?? null,
    status: query.status,
    error: query.error instanceof InventoryApiError ? query.error : null,
    hasNextPage: query.hasNextPage,
    fetchNextPage,
  };
}

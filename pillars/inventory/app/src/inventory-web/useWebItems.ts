/**
 * A cursor-paged, filtered slice of the live item catalogue
 * (`GET /web/items`, Inventory ADR-002 D1/D2) as an infinite React Query.
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { InventoryApiError, unwrap } from '../inventory-api-helpers.js';
import { webList } from '../inventory-api/index.js';
import { toItemRowModel } from './item-row-model.js';
import { WEB_ITEMS_QUERY_KEY } from './queryKeys.js';
import { useCatalogueLookups } from './useCatalogueLookups.js';

import type { ItemRowModel } from '../foundation/model/model';
import type { WebListData, WebListResponses } from '../inventory-api/types.gen.js';

/** The filters `GET /web/items` accepts, everything but pagination. */
export type WebItemsFilters = Omit<WebListData['query'], 'cursor' | 'limit'>;

type WebItemsPage = WebListResponses['200'] & {
  readonly deletedPreviousPlaces?: Readonly<
    Record<string, { readonly kind: 'location' | 'container'; readonly name: string }>
  >;
};

const DEFAULT_LIMIT = 50;
const EMPTY_PAGES: readonly WebItemsPage[] = [];

function useWebItemsQuery(filters: WebItemsFilters, limit: number, refetchOnWindowFocus: boolean) {
  return useInfiniteQuery({
    queryKey: [...WEB_ITEMS_QUERY_KEY, 'list', filters, limit] as const,
    queryFn: async ({ pageParam, signal }): Promise<WebItemsPage> =>
      unwrap(
        await webList({
          query: { ...filters, limit, cursor: pageParam },
          signal,
        })
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchOnWindowFocus,
  });
}

/**
 * Fetch `GET /web/items` a page at a time. `fetchNextPage()` asks for the
 * page after the last one loaded; `hasNextPage` is false once a page comes
 * back with a `null` `nextCursor`. `filters` changing resets pagination, as
 * a query key change always does.
 */
export function useWebItems(filters: WebItemsFilters, limit: number = DEFAULT_LIMIT) {
  return useWebItemsQuery(filters, limit, true);
}

/** The mapped, paged rows and server totals used by Items and Containers pages. */
export interface ItemRows {
  readonly rows: ItemRowModel[];
  /** The filtered total from the first loaded page, or null before it loads. */
  readonly total: number | null;
  /** The unfiltered active baseline from the first loaded page, or null before it loads. */
  readonly unfilteredTotal: number | null;
  /** The inactive rows hidden by the current filter from the first loaded page, or null before it loads. */
  readonly hiddenInactiveCount: number | null;
  /** Alias for `unfilteredTotal` used by list summaries. */
  readonly baseline: number | null;
  /** Alias for `hiddenInactiveCount` used by list summaries. */
  readonly hidden: number | null;
  /** Content totals merged from every loaded page. */
  readonly contentCounts: Readonly<
    Record<string, { readonly direct: number; readonly deep: number }>
  >;
  readonly status: 'pending' | 'error' | 'success';
  readonly error: InventoryApiError | null;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => void;
  readonly refetch: () => void;
}

function deletedPlaceNames(pages: readonly WebItemsPage[]): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const page of pages) {
    for (const [id, place] of Object.entries(page.deletedPreviousPlaces ?? {})) {
      names.set(id, place.name);
    }
  }
  return names;
}

function mergedContentCounts(
  pages: readonly WebItemsPage[]
): Readonly<Record<string, { readonly direct: number; readonly deep: number }>> {
  const counts: Record<string, { readonly direct: number; readonly deep: number }> = {};
  for (const page of pages) {
    for (const [id, count] of Object.entries(page.contentCounts ?? {})) {
      counts[id] = count;
    }
  }
  return counts;
}

function mapRows(
  pages: readonly WebItemsPage[],
  typeNames: ReadonlyMap<string, string>,
  deletedPreviousPlaces: ReadonlyMap<string, string>
): ItemRowModel[] {
  const context = { typeNames, deletedPreviousPlaces };
  return pages
    .flatMap((page) => page.items)
    .map((item) => toItemRowModel(item, context))
    .filter((row): row is ItemRowModel => row !== null);
}

/** Fetches paged web items, maps rows to the foundation model, and exposes server totals. */
export function useItemRows(query: WebItemsFilters, limit: number = DEFAULT_LIMIT): ItemRows {
  const listQuery = useWebItemsQuery(query, limit, false);
  const { typeNameById } = useCatalogueLookups();
  const pages = listQuery.data?.pages ?? EMPTY_PAGES;
  const deletedPreviousPlaces = useMemo(() => deletedPlaceNames(pages), [pages]);
  const rows = useMemo(
    () => mapRows(pages, typeNameById, deletedPreviousPlaces),
    [deletedPreviousPlaces, pages, typeNameById]
  );
  const contentCounts = useMemo(() => mergedContentCounts(pages), [pages]);
  const firstPage = pages[0];
  const error = listQuery.error instanceof InventoryApiError ? listQuery.error : null;
  const total = firstPage?.total ?? null;
  const unfilteredTotal = firstPage?.unfilteredTotal ?? null;
  const hiddenInactiveCount = firstPage?.hiddenInactiveCount ?? null;

  return {
    rows,
    total,
    unfilteredTotal,
    hiddenInactiveCount,
    baseline: unfilteredTotal,
    hidden: hiddenInactiveCount,
    contentCounts,
    status: listQuery.status,
    error,
    hasNextPage: listQuery.hasNextPage,
    isFetchingNextPage: listQuery.isFetchingNextPage,
    fetchNextPage: () => {
      void listQuery.fetchNextPage();
    },
    refetch: () => {
      void listQuery.refetch();
    },
  };
}

import { useQueries } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { unwrap } from '../../inventory-api-helpers.js';
import { webList } from '../../inventory-api/index.js';
import { toItemRowModel } from '../../inventory-web/item-row-model.js';
import {
  LOCATION_TREE_QUERY_KEY,
  PLACEMENT_SOURCES_QUERY_KEY,
  WEB_ITEMS_QUERY_KEY,
} from '../../inventory-web/queryKeys.js';

import type { QueryClient } from '@tanstack/react-query';

import type { WebListResponses } from '../../inventory-api/types.gen.js';
import type { ItemRows } from '../../inventory-web/useWebItems.js';
import type { WebSearchApi } from '../../inventory-web/useWebSearch.js';
import type { ItemRowModel } from '../model/contracts.js';

export const STORE_ROWS_LIMIT = 50;
export const STORE_SEARCH_LIMIT = 20;
export const STORE_CONTENTS_LIMIT = 200;

type StoreContentsPage = WebListResponses['200'] & {
  readonly deletedPreviousPlaces?: Readonly<
    Record<string, { readonly kind: 'location' | 'container'; readonly name: string }>
  >;
};

/** Debounces a changing value until it has stayed still for the supplied delay. */
export function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

function deletedPreviousPlaceNames(page: StoreContentsPage): ReadonlyMap<string, string> {
  return new Map(
    Object.entries(page.deletedPreviousPlaces ?? {}).map(([id, place]) => [id, place.name] as const)
  );
}

/** Reads every page of the direct contents of each selected container. */
export function useSelectedContents(
  selectedRows: readonly ItemRowModel[],
  typeNames: ReadonlyMap<string, string>
): {
  readonly rows: ItemRowModel[];
  readonly status: 'pending' | 'error' | 'success';
  readonly retry: () => void;
} {
  const containerIds = useMemo(
    () =>
      selectedRows
        .filter((row) => row.container !== null)
        .map((row) => row.id)
        .toSorted(),
    [selectedRows]
  );
  const queries = useQueries({
    queries: containerIds.map((containerId) => ({
      queryKey: [...WEB_ITEMS_QUERY_KEY, 'store-here-contents', containerId] as const,
      queryFn: async ({ signal }): Promise<ItemRowModel[]> => {
        const items: StoreContentsPage['items'][number][] = [];
        const deletedPreviousPlaces = new Map<string, string>();
        let cursor: string | undefined;

        do {
          const page = unwrap(
            await webList({
              query:
                cursor === undefined
                  ? { within: containerId, limit: STORE_CONTENTS_LIMIT }
                  : { within: containerId, limit: STORE_CONTENTS_LIMIT, cursor },
              signal,
            })
          );
          items.push(...page.items);
          for (const [id, name] of deletedPreviousPlaceNames(page)) {
            deletedPreviousPlaces.set(id, name);
          }
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);

        return items.map((item) => toItemRowModel(item, { typeNames, deletedPreviousPlaces }));
      },
    })),
  });

  const retry = useCallback((): void => {
    for (const query of queries) {
      if (query.status === 'error') void query.refetch();
    }
  }, [queries]);

  return {
    rows: queries.flatMap((query) => query.data ?? []),
    status: readStatus(...queries),
    retry,
  };
}

/** Reports the blocking status of the Store here reads. */
export function readStatus(
  ...reads: readonly { readonly status: 'pending' | 'error' | 'success' }[]
): 'pending' | 'error' | 'success' {
  if (reads.some((read) => read.status === 'error')) return 'error';
  if (reads.some((read) => read.status === 'pending')) return 'pending';
  return 'success';
}

/** The failed reads and retry controls owned by an open Store here sheet. */
export interface StoreHereRetrySources {
  readonly placement: { readonly isError: boolean };
  readonly hand: Pick<ItemRows, 'status' | 'refetch'>;
  readonly all: Pick<ItemRows, 'status' | 'refetch'>;
  readonly search: Pick<WebSearchApi, 'status' | 'refetch'>;
}

/** Refetches only failed placement, item, search, and selected-content reads. */
export function retryStoreHereReads(
  queryClient: QueryClient,
  sources: StoreHereRetrySources,
  selectedContents: Pick<ReturnType<typeof useSelectedContents>, 'retry'>
): void {
  if (sources.hand.status === 'error') sources.hand.refetch();
  if (sources.all.status === 'error') sources.all.refetch();
  if (sources.search.status === 'error') sources.search.refetch();
  selectedContents.retry();
  if (!sources.placement.isError) return;

  void queryClient.refetchQueries({
    queryKey: LOCATION_TREE_QUERY_KEY,
    type: 'active',
    predicate: (query) => query.state.status === 'error',
  });
  void queryClient.refetchQueries({
    queryKey: PLACEMENT_SOURCES_QUERY_KEY,
    type: 'active',
    predicate: (query) => query.state.status === 'error',
  });
}

/** Combines ordered row groups while retaining the first occurrence of each id. */
export function uniqueRows(groups: readonly (readonly ItemRowModel[])[]): ItemRowModel[] {
  const rows = new Map<string, ItemRowModel>();
  for (const group of groups) {
    for (const row of group) rows.set(row.id, row);
  }
  return [...rows.values()];
}

/** Places an exact search result before the server-ordered item hits. */
export function searchRows(
  exact: ItemRowModel | null,
  items: readonly { readonly item: ItemRowModel }[]
): ItemRowModel[] {
  const rows = new Map<string, ItemRowModel>();
  if (exact !== null) rows.set(exact.id, exact);
  for (const hit of items) rows.set(hit.item.id, hit.item);
  return [...rows.values()];
}

import { useQueries } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { unwrap } from '../../inventory-api-helpers.js';
import { webList } from '../../inventory-api/index.js';
import { toItemRowModel } from '../../inventory-web/item-row-model.js';
import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';

import type { WebListResponses } from '../../inventory-api/types.gen.js';
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

/** Reads the direct contents of each selected container from the web catalogue. */
export function useSelectedContents(
  selectedRows: readonly ItemRowModel[],
  typeNames: ReadonlyMap<string, string>
): ItemRowModel[] {
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
        const page = unwrap(
          await webList({
            query: { within: containerId, limit: STORE_CONTENTS_LIMIT },
            signal,
          })
        );
        const deletedPreviousPlaces = deletedPreviousPlaceNames(page);
        return page.items.map((item) => toItemRowModel(item, { typeNames, deletedPreviousPlaces }));
      },
    })),
  });

  return queries.flatMap((query) => query.data ?? []);
}

/** Reports the blocking status of the two blank-query item reads. */
export function readStatus(
  ...reads: readonly { readonly status: 'pending' | 'error' | 'success' }[]
): 'pending' | 'error' | 'success' {
  if (reads.some((read) => read.status === 'error')) return 'error';
  if (reads.some((read) => read.status === 'pending')) return 'pending';
  return 'success';
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

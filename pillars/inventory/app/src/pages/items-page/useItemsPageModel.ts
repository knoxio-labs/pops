import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useSetPageContext } from '@pops/navigation';
import { type SelectOption } from '@pops/ui';

import { unwrap } from '../../inventory-api-helpers.js';
import {
  itemsDelete,
  itemsDistinctTypes,
  itemsList,
  itemsSearchByAssetId,
  locationsTree,
} from '../../inventory-api/index.js';
import {
  buildQueryInput,
  hasAnyActiveFilter,
  useItemsPageFilters,
  type Filters,
} from './useItemsPageFilters';
import { buildLocationPathMap, flattenLocations } from './useItemsPageLocations';

import type { ItemsListResponses } from '../../inventory-api/types.gen.js';

type InventoryItem = ItemsListResponses['200']['data'][number];
type ItemsListPage = ItemsListResponses['200'];

const VIEW_STORAGE_KEY = 'inventory-view-mode';

// A malformed or adversarial `hasMore`/`offset` pair could otherwise page
// forever; this bounds a single list fetch well past any real library.
const MAX_ITEM_PAGES = 500;

/**
 * Fetches every page of `GET /items` for the given filters, starting at
 * offset 0 and following `pagination.hasMore` until the server reports no
 * more rows. `signal` is forwarded to each request so an aborted caller (see
 * `useItemsPageModel`, which cancels a stale walk on filter change) stops
 * issuing further page requests instead of paging in the background.
 */
export async function fetchAllItemPages(
  queryInput: ReturnType<typeof buildQueryInput>,
  signal: AbortSignal
): Promise<ItemsListPage> {
  const seenIds = new Set<string>();
  const data: InventoryItem[] = [];
  let pagination: ItemsListPage['pagination'] | undefined;
  let totals: ItemsListPage['totals'] | undefined;
  let offset = 0;

  for (let page = 0; page < MAX_ITEM_PAGES; page++) {
    const result = unwrap(await itemsList({ query: { ...queryInput, offset }, signal }));
    for (const item of result.data) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      data.push(item);
    }
    pagination = result.pagination;
    totals = result.totals;
    if (!result.pagination.hasMore) break;
    offset = result.pagination.offset + result.pagination.limit;
  }

  return {
    data,
    pagination: pagination ?? { total: 0, limit: queryInput.limit, offset: 0, hasMore: false },
    totals: totals ?? { totalReplacementValue: 0, totalResaleValue: 0 },
  };
}

export type ViewMode = 'table' | 'grid';

export function getInitialView(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === 'grid' || stored === 'table') return stored;
  } catch {
    // SSR or no localStorage
  }
  return 'table';
}

export const VIEW_STORAGE = VIEW_STORAGE_KEY;

export { useItemsPageFilters };

interface ItemsListResult {
  data: InventoryItem[];
  pagination?: { total?: number };
  totals?: { totalReplacementValue?: number; totalResaleValue?: number };
}
interface DeleteItemInput {
  id: string;
}

function useItemsPageOptions() {
  const { data: typesData } = useQuery({
    queryKey: ['inventory', 'items', 'distinctTypes', undefined],
    queryFn: async () => unwrap(await itemsDistinctTypes()),
  });
  const typeOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [{ value: '', label: 'All Types' }];
    for (const t of typesData?.data ?? []) opts.push({ value: t, label: t });
    return opts;
  }, [typesData]);

  const { data: locationsData } = useQuery({
    queryKey: ['inventory', 'locations', 'tree', undefined],
    queryFn: async () => unwrap(await locationsTree()),
  });
  const locationOptions = useMemo(
    () => flattenLocations(locationsData?.data ?? []),
    [locationsData]
  );
  const locationPathMap = useMemo(
    () => buildLocationPathMap(locationsData?.data ?? []),
    [locationsData]
  );
  return { typeOptions, locationOptions, locationPathMap };
}

function useAssetIdSearchHandler(filters: Filters) {
  const navigate = useNavigate();
  const [, setAssetIdSearching] = useState(false);
  return useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || !filters.search.trim()) return;
      setAssetIdSearching(true);
      try {
        const result = await itemsSearchByAssetId({ query: { assetId: filters.search.trim() } });
        const value = unwrap(result);
        if (value.data) {
          void navigate(`/inventory/items/${value.data.id}`);
        }
      } catch {
        // swallow: a failed lookup leaves the user on the list view
      } finally {
        setAssetIdSearching(false);
      }
    },
    [filters.search, navigate]
  );
}

function summarize(data: ItemsListResult | undefined) {
  return {
    items: data?.data ?? [],
    totalCount: data?.pagination?.total ?? 0,
    totalReplacementValue: data?.totals?.totalReplacementValue ?? 0,
    totalResaleValue: data?.totals?.totalResaleValue ?? 0,
  };
}

function useItemsPageContext(filters: Filters): void {
  const itemsFilters = useMemo(
    () => ({
      ...(filters.search && { search: filters.search }),
      ...(filters.typeFilter && { type: filters.typeFilter }),
      ...(filters.conditionFilter && { condition: filters.conditionFilter }),
      ...(filters.locationFilter && { locationId: filters.locationFilter }),
    }),
    [filters.search, filters.typeFilter, filters.conditionFilter, filters.locationFilter]
  );
  useSetPageContext({ page: 'items', filters: itemsFilters });
}

export function useItemsPageModel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const filters = useItemsPageFilters();
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialView);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  useItemsPageContext(filters);
  const { typeOptions, locationOptions, locationPathMap } = useItemsPageOptions();
  const handleSearchKeyDown = useAssetIdSearchHandler(filters);

  const queryInput = useMemo(() => buildQueryInput(filters), [filters]);
  // Own cancellation rather than relying on TanStack Query's implicit
  // per-observer abort: a filter change starts a brand new queryFn call for
  // the new key immediately, so aborting the previous unit's controller here
  // reliably stops an in-flight multi-page walk instead of letting it keep
  // fetching pages nobody will read.
  const activeFetchRef = useRef<AbortController | null>(null);
  useEffect(() => () => activeFetchRef.current?.abort(), []);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', 'items', 'list', queryInput],
    queryFn: async () => {
      activeFetchRef.current?.abort();
      const controller = new AbortController();
      activeFetchRef.current = controller;
      return fetchAllItemPages(queryInput, controller.signal);
    },
  });
  const summary = summarize(data);

  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteItemInput) =>
      unwrap(await itemsDelete({ path: { id: input.id } })),
    onSuccess: () => {
      setDeletingItemId(null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] }),
  });

  return {
    navigate,
    filters,
    viewMode,
    setViewMode,
    typeOptions,
    locationOptions,
    locationPathMap,
    handleSearchKeyDown,
    ...summary,
    isLoading,
    hasActiveFilters: hasAnyActiveFilter(filters),
    deletingItemId,
    setDeletingItemId,
    deleteMutation,
  };
}

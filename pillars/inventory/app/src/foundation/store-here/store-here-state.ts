import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import {
  LOCATION_TREE_QUERY_KEY,
  PLACEMENT_SOURCES_QUERY_KEY,
} from '../../inventory-web/queryKeys.js';
import { useCatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import { usePlacementSources } from '../../inventory-web/usePlacementSources.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { useWebSearch } from '../../inventory-web/useWebSearch.js';
import { buildWorld } from '../model/placement-model.js';
import { storeRefusal, storeTarget } from './store-here-model.js';
import {
  readStatus,
  searchRows,
  STORE_ROWS_LIMIT,
  STORE_SEARCH_LIMIT,
  uniqueRows,
  useDebouncedValue,
  useSelectedContents,
} from './store-here-queries.js';

import type { QueryClient } from '@tanstack/react-query';

import type { ItemRows } from '../../inventory-web/useWebItems.js';
import type { ItemRowModel, PlacementWorld, StoreHereTarget } from '../model/contracts.js';
import type { StoreCandidate } from './store-here-model.js';

/** The live reads, world, candidates, and selection owned by one sheet. */
export interface StoreHereState {
  status: 'pending' | 'error' | 'success';
  retry: () => void;
  world: PlacementWorld;
  candidates: StoreCandidate[];
  query: string;
  setQuery: (query: string) => void;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  selectedRows: readonly ItemRowModel[];
  removeSelected: (ids: readonly string[]) => void;
}

interface StoreHereSources {
  placement: ReturnType<typeof usePlacementSources>;
  hand: ItemRows;
  all: ItemRows;
  query: string;
  setQuery: (query: string) => void;
  search: ReturnType<typeof useWebSearch>;
  typeNames: ReadonlyMap<string, string>;
}

interface StoreHereWorld {
  world: PlacementWorld;
  candidates: StoreCandidate[];
  candidateById: ReadonlyMap<string, StoreCandidate>;
}

function useStoreHereSources(searchDebounceMs: number): StoreHereSources {
  const placement = usePlacementSources({ kind: 'items', ids: [] });
  const hand = useItemRows({ placementKind: 'hand', sort: 'name' }, STORE_ROWS_LIMIT);
  const all = useItemRows({ sort: 'name' }, STORE_ROWS_LIMIT);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), searchDebounceMs);
  const search = useWebSearch({
    q: debouncedQuery,
    activeOnly: true,
    limit: STORE_SEARCH_LIMIT,
  });
  const { typeNameById } = useCatalogueLookups();

  return { placement, hand, all, query, setQuery, search, typeNames: typeNameById };
}

function useStoreHereWorld(
  target: StoreHereTarget,
  sources: StoreHereSources,
  selectedRows: readonly ItemRowModel[]
): StoreHereWorld {
  const { all, hand, placement, query, search } = sources;
  const contentItems = useSelectedContents(selectedRows, sources.typeNames);
  const blankRows = useMemo(() => uniqueRows([hand.rows, all.rows]), [all.rows, hand.rows]);
  const queriedRows = useMemo(
    () => searchRows(search.results.exact, search.results.items),
    [search.results.exact, search.results.items]
  );
  const rowsForWorld = useMemo(
    () => uniqueRows([[...placement.world.items.values()], hand.rows, all.rows, queriedRows]),
    [all.rows, hand.rows, placement.world.items, queriedRows]
  );
  const world = useMemo(
    () =>
      buildWorld(uniqueRows([rowsForWorld, selectedRows, contentItems]), [
        ...placement.world.locations.values(),
      ]),
    [contentItems, placement.world.locations, rowsForWorld, selectedRows]
  );
  const candidateRows = query.trim() === '' ? blankRows : queriedRows;
  const destination = useMemo(() => storeTarget(target), [target]);
  const candidates = useMemo(
    () =>
      candidateRows
        .filter((item) => item.lifecycle === 'active' && item.id !== target.id)
        .map((item) => ({ item, refusal: storeRefusal(world, item, destination) })),
    [candidateRows, destination, target.id, world]
  );
  const candidateById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.item.id, candidate] as const)),
    [candidates]
  );

  return { world, candidates, candidateById };
}

function retryFailedReads(
  queryClient: QueryClient,
  placementFailed: boolean,
  hand: ItemRows,
  all: ItemRows
): void {
  if (hand.status === 'error') hand.refetch();
  if (all.status === 'error') all.refetch();
  if (!placementFailed) return;

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

function readStateStatus(
  placementError: boolean,
  placementLoading: boolean,
  hand: ItemRows,
  all: ItemRows
): StoreHereState['status'] {
  const rowsStatus = readStatus(hand, all);
  if (placementError || rowsStatus === 'error') return 'error';
  if (placementLoading || rowsStatus === 'pending') return 'pending';
  return 'success';
}

/** Loads the reads, candidate world, query state, and selection for one sheet. */
export function useStoreHereState(
  target: StoreHereTarget,
  searchDebounceMs: number
): StoreHereState {
  const queryClient = useQueryClient();
  const sources = useStoreHereSources(searchDebounceMs);
  const [selectedRows, setSelectedRows] = useState<ReadonlyMap<string, ItemRowModel>>(new Map());
  const selectedRowList = useMemo(() => [...selectedRows.values()], [selectedRows]);
  const { world, candidates, candidateById } = useStoreHereWorld(target, sources, selectedRowList);
  const selected = useMemo(() => new Set(selectedRows.keys()), [selectedRows]);
  const status = readStateStatus(
    sources.placement.isError,
    sources.placement.isLoading,
    sources.hand,
    sources.all
  );
  const toggle = useCallback(
    (id: string): void => {
      const candidate = candidateById.get(id);
      if (candidate === undefined || candidate.refusal !== null) return;
      setSelectedRows((current) => {
        const next = new Map(current);
        if (next.has(id)) next.delete(id);
        else next.set(id, candidate.item);
        return next;
      });
    },
    [candidateById]
  );
  const removeSelected = useCallback((ids: readonly string[]): void => {
    const applied = new Set(ids);
    setSelectedRows((current) => {
      const next = new Map(current);
      for (const id of applied) next.delete(id);
      return next;
    });
  }, []);
  const retry = useCallback(
    (): void => retryFailedReads(queryClient, sources.placement.isError, sources.hand, sources.all),
    [queryClient, sources.all, sources.hand, sources.placement.isError]
  );

  return {
    status,
    retry,
    world,
    candidates,
    query: sources.query,
    setQuery: sources.setQuery,
    selected,
    toggle,
    selectedRows: selectedRowList,
    removeSelected,
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { WEB_ITEMS_MAX_IDS } from '@pops/inventory';

import { buildWorld } from '../foundation/model/placement-model';
import { unwrap } from '../inventory-api-helpers.js';
import { locationsCreate, locationsTree, webList } from '../inventory-api/index.js';
import { appendLocationTree, flattenLocationTree, toItemRowModel } from './item-row-model.js';
import { LOCATION_TREE_QUERY_KEY, PLACEMENT_SOURCES_QUERY_KEY } from './queryKeys.js';
import { useRecents } from './recents.js';
import { useCatalogueLookups } from './useCatalogueLookups.js';

import type { PickerSubject } from '../foundation/model/contracts';
import type { ItemRowModel } from '../foundation/model/model';
import type {
  LocationTreeNode,
  LocationsTreeResponses,
  WebListData,
} from '../inventory-api/types.gen.js';

const PLACEMENT_PAGE_LIMIT = WEB_ITEMS_MAX_IDS;

type WebItemFilters = Omit<WebListData['query'], 'cursor' | 'limit'>;
type LocationTreeResponse = LocationsTreeResponses[200];
type WebItem = Parameters<typeof toItemRowModel>[0];
const EMPTY_LOCATION_TREE: LocationTreeNode[] = [];

/** Input accepted by the placement-picker location creation mutation. */
export interface CreateLocationInput {
  readonly name: string;
  readonly parentId: string | null;
}

async function fetchAllWebItems(filters: WebItemFilters): Promise<WebItem[]> {
  const items: WebItem[] = [];
  let cursor: string | undefined;

  do {
    const page = unwrap(
      await webList({ query: { ...filters, cursor, limit: PLACEMENT_PAGE_LIMIT } })
    );
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);

  return items;
}

function subjectChunksFor(subject: PickerSubject): string[][] {
  if (subject.kind !== 'items') return [];
  const ids = [...new Set(subject.ids)].filter((id) => id.length > 0);
  const chunks: string[][] = [];

  for (let index = 0; index < ids.length; index += WEB_ITEMS_MAX_IDS) {
    chunks.push(ids.slice(index, index + WEB_ITEMS_MAX_IDS));
  }

  return chunks;
}

function useContainerQuery(access: 'open' | 'closed') {
  return useQuery({
    queryKey: [...PLACEMENT_SOURCES_QUERY_KEY, 'containers', access] as const,
    queryFn: () => fetchAllWebItems({ access, isContainer: 'true' }),
  });
}

function useSubjectItemsQuery(subjectChunks: readonly string[][]) {
  return useQuery({
    queryKey: [...PLACEMENT_SOURCES_QUERY_KEY, 'subject', subjectChunks] as const,
    enabled: subjectChunks.length > 0,
    queryFn: async () =>
      (
        await Promise.all(
          subjectChunks.map((ids) =>
            fetchAllWebItems({ ids: ids.join(','), includeInactive: true })
          )
        )
      ).flat(),
  });
}

function usePlacementQueries(subjectChunks: readonly string[][]) {
  const locationsQuery = useQuery({
    queryKey: LOCATION_TREE_QUERY_KEY,
    queryFn: async () => unwrap(await locationsTree()),
  });

  return {
    locationsQuery,
    openContainersQuery: useContainerQuery('open'),
    closedContainersQuery: useContainerQuery('closed'),
    subjectItemsQuery: useSubjectItemsQuery(subjectChunks),
  };
}

function mapItems(
  data: readonly WebItem[] | undefined,
  context: Parameters<typeof toItemRowModel>[1]
) {
  return (data ?? []).map((item) => toItemRowModel(item, context));
}

function usePlacementItems(
  queries: ReturnType<typeof usePlacementQueries>,
  context: Parameters<typeof toItemRowModel>[1]
) {
  return useMemo(() => {
    const openContainers = mapItems(queries.openContainersQuery.data, context);
    const closedContainers = mapItems(queries.closedContainersQuery.data, context);
    const subjectItems = mapItems(queries.subjectItemsQuery.data, context);
    const byId = new Map<string, ItemRowModel>();

    for (const item of [...openContainers, ...closedContainers, ...subjectItems]) {
      byId.set(item.id, item);
    }

    return {
      openContainers,
      closedContainers,
      subjectItems,
      items: [...byId.values()],
    };
  }, [
    context,
    queries.closedContainersQuery.data,
    queries.openContainersQuery.data,
    queries.subjectItemsQuery.data,
  ]);
}

function usePlacementLocations(query: ReturnType<typeof usePlacementQueries>['locationsQuery']) {
  const locationTree = query.data?.data ?? EMPTY_LOCATION_TREE;
  const locations = useMemo(() => flattenLocationTree(locationTree), [locationTree]);
  return { locationTree, locations };
}

function useCreateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, parentId }: CreateLocationInput) =>
      unwrap(await locationsCreate({ body: { name, parentId, sortOrder: 0 } })),
    onSuccess: (response) => {
      queryClient.setQueryData<LocationTreeResponse>(LOCATION_TREE_QUERY_KEY, (current) => {
        if (current === undefined) return current;
        const data = appendLocationTree(current.data, response.data);
        return data === current.data ? current : { ...current, data };
      });
    },
  });
}

/**
 * Loads the location and item sources needed by a placement picker, including
 * inactive subject items and all active open or closed containers.
 */
export function usePlacementSources(subject: PickerSubject) {
  const catalogue = useCatalogueLookups();
  const recentState = useRecents();
  const subjectChunks = useMemo(() => subjectChunksFor(subject), [subject]);
  const queries = usePlacementQueries(subjectChunks);
  const mapperContext = { typeNames: catalogue.typeNameById };
  const itemSources = usePlacementItems(queries, mapperContext);
  const locationSources = usePlacementLocations(queries.locationsQuery);
  const world = useMemo(
    () => buildWorld(itemSources.items, locationSources.locations),
    [itemSources.items, locationSources.locations]
  );
  const createLocation = useCreateLocation();
  const error =
    queries.locationsQuery.error ??
    queries.openContainersQuery.error ??
    queries.closedContainersQuery.error ??
    queries.subjectItemsQuery.error ??
    catalogue.error;
  const isLoading = [
    catalogue.isPending,
    queries.locationsQuery.isPending,
    queries.openContainersQuery.isPending,
    queries.closedContainersQuery.isPending,
    subjectChunks.length > 0 && queries.subjectItemsQuery.isPending,
  ].some(Boolean);

  return {
    catalogue: catalogue.catalogue,
    ...locationSources,
    ...itemSources,
    world,
    recents: recentState.placements,
    createLocation,
    isLoading,
    isError: error !== null,
    error,
    ...queries,
  };
}

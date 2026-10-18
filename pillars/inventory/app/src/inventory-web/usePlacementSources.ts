import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { WEB_ITEMS_MAX_IDS } from '@pops/inventory';

import { buildWorld } from '../foundation/model/placement-model';
import { unwrap } from '../inventory-api-helpers.js';
import {
  locationsCreate,
  locationsTree,
  webList,
  webPlacementSources,
} from '../inventory-api/index.js';
import { flattenLocationTree, toItemRowModel } from './item-row-model.js';
import { appendNode, nextSortOrder } from './location-tree-cache.js';
import { LOCATION_TREE_QUERY_KEY, PLACEMENT_SOURCES_QUERY_KEY } from './queryKeys.js';
import { useRecents } from './recents.js';
import { useCatalogueLookups } from './useCatalogueLookups.js';

import type { PickerSubject } from '../foundation/model/contracts';
import type { ItemRowModel } from '../foundation/model/model';
import type { LocationTreeNode, LocationsTreeResponses } from '../inventory-api/types.gen.js';

const PLACEMENT_PAGE_LIMIT = WEB_ITEMS_MAX_IDS;

const EMPTY_LOCATION_TREE: LocationTreeNode[] = [];

/** Input accepted by the placement-picker location creation mutation. */
export interface CreateLocationInput {
  readonly name: string;
  readonly parentId: string | null;
}

async function fetchAllPlacementItems<Item>(
  signal: AbortSignal,
  fetchPage: (cursor: string | undefined) => Promise<{ items: Item[]; nextCursor: string | null }>
): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | undefined;
  do {
    signal.throwIfAborted();
    const page = await fetchPage(cursor);
    signal.throwIfAborted();
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

function useContainerQuery() {
  return useQuery({
    queryKey: [...PLACEMENT_SOURCES_QUERY_KEY, 'containers'] as const,
    queryFn: ({ signal }) =>
      fetchAllPlacementItems(signal, async (cursor) =>
        unwrap(
          await webPlacementSources({ query: { cursor, limit: PLACEMENT_PAGE_LIMIT }, signal })
        )
      ),
  });
}

function useSubjectItemsQuery(subjectChunks: readonly string[][]) {
  return useQuery({
    queryKey: [...PLACEMENT_SOURCES_QUERY_KEY, 'subject', subjectChunks] as const,
    enabled: subjectChunks.length > 0,
    queryFn: async ({ signal }) =>
      (
        await Promise.all(
          subjectChunks.map((ids) =>
            fetchAllPlacementItems(signal, async (cursor) =>
              unwrap(
                await webList({
                  query: {
                    ids: ids.join(','),
                    includeInactive: true,
                    cursor,
                    limit: PLACEMENT_PAGE_LIMIT,
                  },
                  signal,
                })
              )
            )
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
    containersQuery: useContainerQuery(),
    subjectItemsQuery: useSubjectItemsQuery(subjectChunks),
  };
}

function mapItems(
  data: readonly Parameters<typeof toItemRowModel>[0][] | undefined,
  context: Parameters<typeof toItemRowModel>[1]
) {
  return (data ?? []).map((item) => toItemRowModel(item, context));
}

function usePlacementItems(
  queries: ReturnType<typeof usePlacementQueries>,
  context: Parameters<typeof toItemRowModel>[1]
) {
  return useMemo(() => {
    const containers = mapItems(queries.containersQuery.data, context);
    const openContainers = containers.filter((item) => item.container?.access === 'open');
    const closedContainers = containers.filter((item) => item.container?.access === 'closed');
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
  }, [context, queries.containersQuery.data, queries.subjectItemsQuery.data]);
}

function usePlacementLocations(query: ReturnType<typeof usePlacementQueries>['locationsQuery']) {
  const locationTree = query.data?.data ?? EMPTY_LOCATION_TREE;
  const locations = useMemo(() => flattenLocationTree(locationTree), [locationTree]);
  return { locationTree, locations };
}

function useCreateLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, parentId }: CreateLocationInput) => {
      const cache = queryClient.getQueryData<LocationsTreeResponses[200]>(LOCATION_TREE_QUERY_KEY);
      const sortOrder = nextSortOrder(cache, parentId);
      return unwrap(await locationsCreate({ body: { name, parentId, sortOrder } }));
    },
    onSuccess: (response) => {
      queryClient.setQueryData<LocationsTreeResponses[200]>(LOCATION_TREE_QUERY_KEY, (current) => {
        if (current === undefined) return current;
        return appendNode(current, { ...response.data, children: [] });
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
  const mapperContext = useMemo(
    () => ({ typeNames: catalogue.typeNameById }),
    [catalogue.typeNameById]
  );
  const itemSources = usePlacementItems(queries, mapperContext);
  const locationSources = usePlacementLocations(queries.locationsQuery);
  const world = useMemo(
    () => buildWorld(itemSources.items, locationSources.locations),
    [itemSources.items, locationSources.locations]
  );
  const createLocation = useCreateLocation();
  const error =
    queries.locationsQuery.error ??
    queries.containersQuery.error ??
    queries.subjectItemsQuery.error ??
    catalogue.error;
  const isLoading = [
    catalogue.isPending,
    queries.locationsQuery.isPending,
    queries.containersQuery.isPending,
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

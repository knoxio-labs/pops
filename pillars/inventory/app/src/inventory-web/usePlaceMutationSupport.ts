import { type QueryClient } from '@tanstack/react-query';

import { unwrap } from '../inventory-api-helpers.js';
import { locationsDelete, locationsUpdate } from '../inventory-api/index.js';
import { findNode, placeNode, type LocationTreeCache } from './location-tree-cache.js';
import { LOCATIONS_TREE_QUERY_KEY } from './queryKeys.js';

const LOCATIONS_INVALIDATION_KEY = ['inventory', 'locations'] as const;
const WEB_INVALIDATION_KEY = ['inventory', 'web'] as const;

type LocationUpdateBody = { name?: string; parentId?: string | null; sortOrder?: number };

interface PlaceSnapshot {
  readonly id: string;
  readonly parentId: string | null;
  readonly sortOrder: number;
}

interface NamedPlaceSnapshot extends PlaceSnapshot {
  readonly name: string;
}

interface ArrangeWrite extends PlaceSnapshot {
  readonly body: { parentId?: string | null; sortOrder: number };
}

function tree(queryClient: QueryClient): LocationTreeCache | undefined {
  return queryClient.getQueryData<LocationTreeCache>(LOCATIONS_TREE_QUERY_KEY);
}

function setTree(queryClient: QueryClient, cache: LocationTreeCache | undefined): void {
  queryClient.setQueryData<LocationTreeCache>(LOCATIONS_TREE_QUERY_KEY, cache);
}

function patchTree(
  queryClient: QueryClient,
  update: (cache: LocationTreeCache) => LocationTreeCache
): void {
  queryClient.setQueryData<LocationTreeCache>(LOCATIONS_TREE_QUERY_KEY, (current) =>
    current === undefined ? undefined : update(current)
  );
}

async function invalidate(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: LOCATIONS_INVALIDATION_KEY }),
    queryClient.invalidateQueries({ queryKey: WEB_INVALIDATION_KEY }),
  ]);
}

async function updateLocation(id: string, body: LocationUpdateBody): Promise<void> {
  unwrap(await locationsUpdate({ path: { id }, body }));
}

async function deleteLocation(id: string, force?: boolean): Promise<void> {
  const result = unwrap(
    await locationsDelete({
      path: { id },
      ...(force === undefined ? {} : { query: { force } }),
    })
  );
  if ('requiresConfirmation' in result) throw new Error('place is no longer empty');
}

async function optimisticTreeWrite(
  queryClient: QueryClient,
  before: LocationTreeCache | undefined,
  update: (cache: LocationTreeCache) => LocationTreeCache,
  write: () => Promise<void>
): Promise<void> {
  patchTree(queryClient, update);
  try {
    await write();
  } catch (error) {
    setTree(queryClient, before);
    throw error;
  } finally {
    await invalidate(queryClient);
  }
}

function placeSnapshot(cache: LocationTreeCache | undefined, id: string): NamedPlaceSnapshot {
  const found = cache === undefined ? null : findNode(cache, id);
  if (found === null) throw new Error(`place ${id} is not loaded`);
  return { id, parentId: found.parentId, sortOrder: found.node.sortOrder, name: found.node.name };
}

function arrangedTree(
  cache: LocationTreeCache,
  parentId: string | null,
  order: readonly string[]
): LocationTreeCache {
  return order.reduce(
    (current, placeId, sortOrder) => placeNode(current, placeId, parentId, sortOrder),
    cache
  );
}

function arrangeWrites(
  cache: LocationTreeCache,
  id: string,
  parentId: string | null,
  order: readonly string[]
): ArrangeWrite[] {
  return order.flatMap((placeId, sortOrder) => {
    const found = findNode(cache, placeId);
    if (found === null) return [];
    const moved = placeId === id;
    const changed = moved
      ? found.parentId !== parentId || found.node.sortOrder !== sortOrder
      : found.node.sortOrder !== sortOrder;
    return changed
      ? [
          {
            id: placeId,
            parentId: found.parentId,
            sortOrder: found.node.sortOrder,
            body: moved ? { parentId, sortOrder } : { sortOrder },
          },
        ]
      : [];
  });
}

interface ReversibleOperation {
  readonly before: LocationTreeCache | undefined;
  readonly update: (cache: LocationTreeCache) => LocationTreeCache;
  readonly write: () => Promise<void>;
  readonly undoUpdate: (cache: LocationTreeCache) => LocationTreeCache;
  readonly undoWrite: () => Promise<void>;
}

async function reversible(
  queryClient: QueryClient,
  operation: ReversibleOperation
): Promise<{ undo: () => Promise<void> }> {
  await optimisticTreeWrite(queryClient, operation.before, operation.update, operation.write);
  return {
    undo: () =>
      optimisticTreeWrite(
        queryClient,
        tree(queryClient),
        operation.undoUpdate,
        operation.undoWrite
      ),
  };
}

async function restoreArrangement(
  queryClient: QueryClient,
  writes: readonly ArrangeWrite[]
): Promise<void> {
  const before = tree(queryClient);
  patchTree(queryClient, (cache) =>
    writes.reduce(
      (current, write) => placeNode(current, write.id, write.parentId, write.sortOrder),
      cache
    )
  );
  try {
    for (const write of writes.toReversed()) {
      await updateLocation(write.id, { parentId: write.parentId, sortOrder: write.sortOrder });
    }
  } catch (error) {
    setTree(queryClient, before);
    throw error;
  } finally {
    await invalidate(queryClient);
  }
}

/** Shared cache and API operations for place mutations. */
export const placeMutationSupport = {
  arrangeWrites,
  arrangedTree,
  deleteLocation,
  invalidate,
  optimisticTreeWrite,
  placeSnapshot,
  restoreArrangement,
  reversible,
  patchTree,
  setTree,
  tree,
  updateLocation,
};

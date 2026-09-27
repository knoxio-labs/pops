import { unwrap } from '../inventory-api-helpers.js';
import { locationsCreate } from '../inventory-api/index.js';
import {
  appendNode,
  nextSortOrder,
  placeNode,
  removeNode,
  renameNode,
} from './location-tree-cache.js';
import { placeMutationSupport } from './usePlaceMutationSupport.js';

import type { QueryClient } from '@tanstack/react-query';

import type { BulkItemVerbs } from './item-verbs-bulk.js';
import type { PlaceRemoval, PlaceUndo } from './place-mutation-types.js';

const {
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
} = placeMutationSupport;

async function createPlace(
  queryClient: QueryClient,
  name: string,
  parentId: string | null
): Promise<{ id: string } & PlaceUndo> {
  const sortOrder = nextSortOrder(tree(queryClient), parentId);
  try {
    const response = unwrap(
      await locationsCreate({ body: { name: name.trim(), parentId, sortOrder } })
    );
    patchTree(queryClient, (cache) => appendNode(cache, { ...response.data, children: [] }));
    return {
      id: response.data.id,
      undo: async () => {
        try {
          await deleteLocation(response.data.id);
        } finally {
          await invalidate(queryClient);
        }
      },
    };
  } finally {
    await invalidate(queryClient);
  }
}

async function renamePlace(queryClient: QueryClient, id: string, name: string): Promise<PlaceUndo> {
  const before = tree(queryClient);
  const snapshot = placeSnapshot(before, id);
  const nextName = name.trim();
  return reversible(queryClient, {
    before,
    update: (cache) => renameNode(cache, id, nextName),
    write: () => updateLocation(id, { name: nextName }),
    undoUpdate: (cache) => renameNode(cache, id, snapshot.name),
    undoWrite: () => updateLocation(id, { name: snapshot.name }),
  });
}

async function movePlace(
  queryClient: QueryClient,
  id: string,
  parentId: string | null
): Promise<PlaceUndo> {
  const before = tree(queryClient);
  const snapshot = placeSnapshot(before, id);
  const sortOrder = nextSortOrder(before, parentId);
  return reversible(queryClient, {
    before,
    update: (cache) => placeNode(cache, id, parentId, sortOrder),
    write: () => updateLocation(id, { parentId, sortOrder }),
    undoUpdate: (cache) => placeNode(cache, id, snapshot.parentId, snapshot.sortOrder),
    undoWrite: () =>
      updateLocation(id, { parentId: snapshot.parentId, sortOrder: snapshot.sortOrder }),
  });
}

async function arrangePlaces(
  queryClient: QueryClient,
  id: string,
  parentId: string | null,
  order: readonly string[]
): Promise<PlaceUndo> {
  if (!order.includes(id)) throw new Error('order must contain the place');
  const before = tree(queryClient);
  if (before === undefined) throw new Error('place tree is not loaded');
  const writes = arrangeWrites(before, id, parentId, order);
  await optimisticTreeWrite(
    queryClient,
    before,
    (cache) => arrangedTree(cache, parentId, order),
    async () => {
      for (const write of writes) await updateLocation(write.id, write.body);
    }
  );
  return { undo: () => restoreArrangement(queryClient, writes) };
}

async function removePlace(
  queryClient: QueryClient,
  bulkItemVerbs: BulkItemVerbs,
  removal: PlaceRemoval
): Promise<void> {
  const before = tree(queryClient);
  patchTree(queryClient, (cache) =>
    removeNode(cache, removal.placeId, removal.mode === 'reparent' ? 'reparent' : 'subtree')
  );
  try {
    if (removal.mode === 'reparent') {
      if (removal.parentId !== null && removal.thingIds.length > 0) {
        await bulkItemVerbs.move(removal.thingIds, {
          kind: 'location',
          locationId: removal.parentId,
        });
      }
      await deleteLocation(removal.placeId, true);
    } else {
      for (const placeId of removal.subtreeIds.toReversed()) await deleteLocation(placeId, true);
    }
  } catch (error) {
    setTree(queryClient, before);
    throw error;
  } finally {
    await invalidate(queryClient);
  }
}

/** Creates the place mutation actions bound to one query client and bulk verb set. */
export function createPlaceActions(queryClient: QueryClient, bulkItemVerbs: BulkItemVerbs) {
  return {
    create: (name: string, parentId: string | null) => createPlace(queryClient, name, parentId),
    rename: (id: string, name: string) => renamePlace(queryClient, id, name),
    move: (id: string, parentId: string | null) => movePlace(queryClient, id, parentId),
    arrange: (id: string, parentId: string | null, order: readonly string[]) =>
      arrangePlaces(queryClient, id, parentId, order),
    remove: (removal: PlaceRemoval) => removePlace(queryClient, bulkItemVerbs, removal),
  };
}

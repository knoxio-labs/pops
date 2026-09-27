import { useCallback } from 'react';
import { toast } from 'sonner';

import { subtreeIds } from './tree-model.js';

import type { Dispatch, SetStateAction } from 'react';

import type { usePlaceMutations } from '../../inventory-web/usePlaceMutations.js';
import type { PlacementWorld } from '../model/placement-model.js';
import type { DeleteMode, DeletePlan } from './delete-plan.js';
import type { PendingDelete } from './place-edit-types.js';

type PlaceMutations = ReturnType<typeof usePlaceMutations>;
type StateSetter<T> = Dispatch<SetStateAction<T>>;

interface DeleteEditOptions {
  world: PlacementWorld;
  offline: boolean;
  deleting: PendingDelete | null;
  setDeleting: StateSetter<PendingDelete | null>;
  onDeleted: (plan: DeletePlan) => void;
  mutations: PlaceMutations;
}

function saveError(reason: unknown): void {
  const message =
    reason instanceof Error ? reason.message : 'The inventory service did not answer.';
  toast.error(`Not saved. ${message}`);
}

/** Binds delete planning, refusal handling and its mutation to the place editor state. */
export function useDeleteEdits({
  world,
  offline,
  deleting,
  setDeleting,
  onDeleted,
  mutations,
}: DeleteEditOptions) {
  const requestDelete = useCallback(
    (id: string): void => {
      if (offline || !world.locations.has(id)) return;
      const parentId = world.locations.get(id)?.parentId ?? null;
      setDeleting({ placeId: id, mode: parentId === null ? 'to-hand' : 'reparent' });
    },
    [offline, setDeleting, world]
  );
  const setDeleteMode = useCallback(
    (mode: DeleteMode): void => {
      setDeleting((current) => (current === null ? null : { ...current, mode }));
    },
    [setDeleting]
  );
  const confirmDelete = useCallback(
    (plan: DeletePlan): void => {
      if (offline || plan.refusal !== null) return;
      setDeleting(null);
      onDeleted(plan);
      void mutations
        .remove({
          placeId: plan.place.id,
          mode: plan.mode,
          parentId: plan.parent?.id ?? null,
          subtreeIds: subtreeIds(world, plan.place.id),
          thingIds: plan.things.map((thing) => thing.id),
        })
        .then(() => toast(`Deleted ${plan.place.name}`))
        .catch(saveError);
    },
    [mutations, offline, onDeleted, setDeleting, world]
  );
  const cancelDelete = useCallback((): void => setDeleting(null), [setDeleting]);
  return { deleting, requestDelete, setDeleteMode, confirmDelete, cancelDelete };
}

import { useCallback } from 'react';

import { showUndoToast } from '../../foundation/feedback/undo-toast.js';
import { placeMoveVerdict, subtreeIds } from '../../foundation/places/tree-model.js';
import { deleteStateFor } from './location-page-edits-utils.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PendingDelete } from '../../foundation/places/delete-place-dialog.js';
import type { DeletePlan } from '../../foundation/places/delete-plan.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceMutations } from '../../inventory-web/usePlaceMutations.js';
import type { EditState } from './location-page-edit-state.js';
import type { usePlaceEditMutations } from './location-page-edits-mutations.js';
import type { DeletePlaceState, PlaceEditsApi } from './location-page-parts.js';

/** Binds the legacy place deletion request and confirmation flow. */
export function useDeleteActions({
  state,
  mutation,
  world,
  tallyOf,
  requireOnline,
  setPendingDelete,
}: {
  state: EditState;
  mutation: ReturnType<typeof usePlaceEditMutations>['remove'];
  world: PlacementWorld;
  tallyOf: (id: string) => PlaceTally;
  requireOnline: () => boolean;
  setPendingDelete: (pending: PendingDelete | null) => void;
}): Pick<PlaceEditsApi, 'requestDelete' | 'confirmDelete' | 'cancelDelete'> {
  const requestDelete = useCallback(
    (id: string) => {
      if (requireOnline()) {
        const place = world.locations.get(id);
        state.setDeleting(deleteStateFor(world, tallyOf, id));
        if (place !== undefined) {
          setPendingDelete({
            placeId: id,
            mode: place.parentId === null ? 'to-hand' : 'reparent',
          });
        }
      }
    },
    [requireOnline, setPendingDelete, state, tallyOf, world]
  );
  const confirmDelete = useCallback(() => {
    if (state.deleting === null || !requireOnline()) return;
    mutation.mutate({
      state: state.deleting,
      force: state.deleting.requiresForce,
    });
  }, [mutation, requireOnline, state]);
  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
    state.setDeleting(null);
  }, [setPendingDelete, state]);
  return { requestDelete, confirmDelete, cancelDelete };
}

/** Binds a place tree reorder to the undoable place mutation adapter. */
export function useArrangeAction({
  mutations,
  world,
  requireOnline,
  setError,
}: {
  mutations: Pick<PlaceMutations, 'arrange'>;
  world: PlacementWorld;
  requireOnline: () => boolean;
  setError: (message: string | null) => void;
}): NonNullable<PlaceEditsApi['arrange']> {
  return useCallback(
    (id: string, parentId: string | null, order: readonly string[]): void => {
      if (!requireOnline()) return;
      const place = world.locations.get(id);
      if (place === undefined || !order.includes(id)) return;
      const verdict = placeMoveVerdict(world, id, parentId);
      if (!verdict.ok && verdict.reason !== 'Already there.') return;
      const destination = parentId === null ? 'the top level' : world.locations.get(parentId)?.name;
      void mutations
        .arrange(id, parentId, order)
        .then(({ undo }) => {
          showUndoToast({
            concept: 'move',
            message: `Moved ${place.name} to ${destination ?? 'the new place'}`,
            onUndo: undo,
          });
        })
        .catch((reason: unknown) =>
          setError(
            reason instanceof Error ? reason.message : 'The inventory service did not answer.'
          )
        );
    },
    [mutations, requireOnline, setError, world]
  );
}

/** Sends a validated delete plan through the tracked place mutation adapter. */
export function useConfirmDeletePlan({
  online,
  world,
  placeMutations,
  setPendingDelete,
  setDeleting,
  setError,
  onDeleted,
}: {
  online: boolean;
  world: PlacementWorld;
  placeMutations: Pick<PlaceMutations, 'remove'>;
  setPendingDelete: (pending: PendingDelete | null) => void;
  setDeleting: (state: DeletePlaceState | null) => void;
  setError: (message: string | null) => void;
  onDeleted: (parentId: string | null) => void;
}): (plan: DeletePlan) => void {
  return useCallback(
    (plan: DeletePlan): void => {
      if (!online || plan.refusal !== null) return;
      setPendingDelete(null);
      setDeleting(null);
      void placeMutations
        .remove({
          placeId: plan.place.id,
          mode: plan.mode,
          parentId: plan.parent?.id ?? null,
          subtreeIds: subtreeIds(world, plan.place.id),
          thingIds: plan.things.map((thing) => thing.id),
        })
        .then(() => onDeleted(plan.parent?.id ?? null))
        .catch((reason: unknown) =>
          setError(
            reason instanceof Error ? reason.message : 'The inventory service did not answer.'
          )
        );
    },
    [online, onDeleted, placeMutations, setDeleting, setError, setPendingDelete, world]
  );
}

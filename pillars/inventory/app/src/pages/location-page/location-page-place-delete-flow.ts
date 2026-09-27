import { useCallback, useState } from 'react';

import {
  useArrangeAction,
  useConfirmDeletePlan,
  useDeleteActions,
} from './location-page-place-delete-actions.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PendingDelete } from '../../foundation/places/delete-place-dialog.js';
import type { DeletePlan } from '../../foundation/places/delete-plan.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceMutations } from '../../inventory-web/usePlaceMutations.js';
import type { EditState } from './location-page-edit-state.js';
import type { usePlaceEditMutations } from './location-page-edits-mutations.js';
import type { PlaceEditsApi } from './location-page-parts.js';

function useDeleteDialogActions({
  state,
  mutations,
  world,
  tallyOf,
  requireOnline,
}: {
  state: EditState;
  mutations: ReturnType<typeof usePlaceEditMutations>;
  world: PlacementWorld;
  tallyOf: (id: string) => PlaceTally;
  requireOnline: () => boolean;
}): {
  pendingDelete: PendingDelete | null;
  setPendingDelete: (pending: PendingDelete | null) => void;
  setDeleteMode: (mode: PendingDelete['mode']) => void;
  requestDelete: PlaceEditsApi['requestDelete'];
  confirmDelete: PlaceEditsApi['confirmDelete'];
  cancelDelete: PlaceEditsApi['cancelDelete'];
} {
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const remove = useDeleteActions({
    state,
    mutation: mutations.remove,
    world,
    tallyOf,
    requireOnline,
    setPendingDelete,
  });
  const confirmDelete = useCallback((): void => {
    setPendingDelete(null);
    remove.confirmDelete();
  }, [remove]);
  const cancelDelete = useCallback((): void => {
    setPendingDelete(null);
    remove.cancelDelete();
  }, [remove]);
  const setDeleteMode = useCallback((mode: PendingDelete['mode']): void => {
    setPendingDelete((current) => (current === null ? null : { ...current, mode }));
  }, []);
  return { pendingDelete, setPendingDelete, setDeleteMode, ...remove, confirmDelete, cancelDelete };
}

/** Composes the location-page delete dialog, arrange, and plan actions. */
export function usePlaceDeleteActions({
  online,
  world,
  tallyOf,
  onDeleted,
  state,
  mutations,
  placeMutations,
  requireOnline,
}: {
  online: boolean;
  world: PlacementWorld;
  tallyOf: (id: string) => PlaceTally;
  onDeleted: (parentId: string | null) => void;
  state: EditState;
  mutations: ReturnType<typeof usePlaceEditMutations>;
  placeMutations: PlaceMutations;
  requireOnline: () => boolean;
}): {
  pendingDelete: PendingDelete | null;
  arrange: NonNullable<PlaceEditsApi['arrange']>;
  setDeleteMode: (mode: PendingDelete['mode']) => void;
  confirmDeletePlan: (plan: DeletePlan) => void;
  requestDelete: PlaceEditsApi['requestDelete'];
  confirmDelete: PlaceEditsApi['confirmDelete'];
  cancelDelete: PlaceEditsApi['cancelDelete'];
} {
  const dialog = useDeleteDialogActions({
    state,
    mutations,
    world,
    tallyOf,
    requireOnline,
  });
  const arrange = useArrangeAction({
    mutations: placeMutations,
    world,
    requireOnline,
    setError: state.setError,
  });
  const confirmDeletePlan = useConfirmDeletePlan({
    online,
    world,
    placeMutations,
    setPendingDelete: dialog.setPendingDelete,
    setDeleting: state.setDeleting,
    setError: state.setError,
    onDeleted,
  });
  return { ...dialog, arrange, confirmDeletePlan };
}

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { usePlaceMutations } from '../../inventory-web/usePlaceMutations.js';
import { useEditState } from './location-page-edit-state.js';
import { usePlaceEditMutations } from './location-page-edits-mutations.js';
import { usePlaceEditActions } from './location-page-place-edit-actions.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceEditsApi } from './location-page-parts.js';

/** Binds the location-page place actions to the inventory REST mutations. */
export function usePlaceEdits({
  online,
  world,
  tallyOf,
  onDeleted,
}: {
  readonly online: boolean;
  readonly world: PlacementWorld;
  readonly tallyOf: (id: string) => PlaceTally;
  readonly onDeleted: (parentId: string | null) => void;
}): PlaceEditsApi {
  const queryClient = useQueryClient();
  const placeMutations = usePlaceMutations();
  const state = useEditState();
  const mutations = usePlaceEditMutations({
    queryClient,
    world,
    setDeleting: state.setDeleting,
    setLastMove: state.setLastMove,
    setCreatingUnder: state.setCreatingUnder,
    setRenamingId: state.setRenamingId,
    setError: state.setError,
    onDeleted,
  });
  const actions = usePlaceEditActions({
    online,
    world,
    tallyOf,
    onDeleted,
    state,
    mutations,
    placeMutations,
  });
  const clearMoveNotice = useCallback(() => state.setLastMove(null), [state]);
  const clearError = useCallback(() => state.setError(null), [state]);
  return {
    creatingUnder: state.creatingUnder,
    renamingId: state.renamingId,
    deleting: state.deleting,
    lastMove: state.lastMove,
    error: state.error,
    ...actions,
    clearMoveNotice,
    clearError,
  };
}

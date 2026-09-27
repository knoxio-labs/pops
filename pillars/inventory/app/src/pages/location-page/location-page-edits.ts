import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { useEditState, type EditState } from './location-page-edit-state.js';
import {
  usePlaceEditMutations,
  type CreatePlaceInput,
  type DeletePlaceInput,
  type MovePlaceInput,
  type RenamePlaceInput,
} from './location-page-edits-mutations.js';
import { deleteStateFor } from './location-page-edits-utils.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceEditsApi } from './location-page-parts.js';

function useOnlineGuard(online: boolean, setError: (message: string | null) => void) {
  return useCallback((): boolean => {
    if (online) return true;
    setError(OFFLINE_REASON);
    return false;
  }, [online, setError]);
}

function useCreateActions(
  state: EditState,
  mutation: ReturnType<typeof usePlaceEditMutations>['create'],
  requireOnline: () => boolean
): Pick<PlaceEditsApi, 'startCreate' | 'commitCreate' | 'cancelCreate'> {
  const startCreate = useCallback(
    (parentId?: string) => {
      if (requireOnline()) state.setCreatingUnder(parentId ?? null);
    },
    [requireOnline, state]
  );
  const commitCreate = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (trimmed === '') {
        state.setError('A place name is required.');
        return;
      }
      if (requireOnline()) {
        const input: CreatePlaceInput = { name: trimmed, parentId: state.creatingUnder };
        mutation.mutate(input);
      }
    },
    [mutation, requireOnline, state]
  );
  const cancelCreate = useCallback(() => state.setCreatingUnder(null), [state]);
  return { startCreate, commitCreate, cancelCreate };
}

function useRenameActions(
  state: EditState,
  mutation: ReturnType<typeof usePlaceEditMutations>['rename'],
  requireOnline: () => boolean
): Pick<PlaceEditsApi, 'startRename' | 'commitRename'> {
  const startRename = useCallback(
    (id: string | null) => {
      if (id === null || requireOnline()) state.setRenamingId(id);
    },
    [requireOnline, state]
  );
  const commitRename = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (state.renamingId === null) return;
      if (trimmed === '') {
        state.setError('A place name is required.');
        return;
      }
      if (requireOnline()) {
        const input: RenamePlaceInput = { id: state.renamingId, name: trimmed };
        mutation.mutate(input);
      }
    },
    [mutation, requireOnline, state]
  );
  return { startRename, commitRename };
}

function useMoveAction(
  mutation: ReturnType<typeof usePlaceEditMutations>['move'],
  world: PlacementWorld,
  requireOnline: () => boolean
): Pick<PlaceEditsApi, 'moveTo'> {
  return {
    moveTo: (id: string, parentId: string | null): void => {
      if (!requireOnline()) return;
      const place = world.locations.get(id);
      if (place === undefined || place.parentId === parentId) return;
      const parentName =
        parentId === null
          ? 'the top level'
          : (world.locations.get(parentId)?.name ?? 'the new place');
      const input: MovePlaceInput = {
        id,
        name: place.name,
        parentId,
        previousParentId: place.parentId,
        parentName,
      };
      mutation.mutate(input);
    },
  };
}

function useDeleteActions({
  state,
  mutation,
  world,
  tallyOf,
  requireOnline,
}: {
  state: EditState;
  mutation: ReturnType<typeof usePlaceEditMutations>['remove'];
  world: PlacementWorld;
  tallyOf: (id: string) => PlaceTally;
  requireOnline: () => boolean;
}): Pick<PlaceEditsApi, 'requestDelete' | 'confirmDelete' | 'cancelDelete'> {
  const requestDelete = useCallback(
    (id: string) => {
      if (requireOnline()) state.setDeleting(deleteStateFor(world, tallyOf, id));
    },
    [requireOnline, state, tallyOf, world]
  );
  const confirmDelete = useCallback(() => {
    if (state.deleting === null || !requireOnline()) return;
    const input: DeletePlaceInput = {
      state: state.deleting,
      force: state.deleting.requiresForce,
    };
    mutation.mutate(input);
  }, [mutation, requireOnline, state]);
  const cancelDelete = useCallback(() => state.setDeleting(null), [state]);
  return { requestDelete, confirmDelete, cancelDelete };
}

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
  const requireOnline = useOnlineGuard(online, state.setError);
  const create = useCreateActions(state, mutations.create, requireOnline);
  const rename = useRenameActions(state, mutations.rename, requireOnline);
  const move = useMoveAction(mutations.move, world, requireOnline);
  const remove = useDeleteActions({
    state,
    mutation: mutations.remove,
    world,
    tallyOf,
    requireOnline,
  });
  const clearMoveNotice = useCallback(() => state.setLastMove(null), [state]);
  const clearError = useCallback(() => state.setError(null), [state]);
  return {
    creatingUnder: state.creatingUnder,
    renamingId: state.renamingId,
    deleting: state.deleting,
    lastMove: state.lastMove,
    error: state.error,
    ...create,
    ...rename,
    ...move,
    ...remove,
    clearMoveNotice,
    clearError,
  };
}

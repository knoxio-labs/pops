import { useCallback } from 'react';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { placeMoveVerdict, placeNameProblem } from '../../foundation/places/tree-model.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { EditState } from './location-page-edit-state.js';
import type { usePlaceEditMutations } from './location-page-edits-mutations.js';
import type { PlaceEditsApi } from './location-page-parts.js';

/** Returns a guard that records the offline refusal for a place edit. */
export function useOnlineGuard(online: boolean, setError: (message: string | null) => void) {
  return useCallback((): boolean => {
    if (online) return true;
    setError(OFFLINE_REASON);
    return false;
  }, [online, setError]);
}

/** Binds create-place validation and mutation to the location edit state. */
export function useCreateActions(
  state: EditState,
  mutation: ReturnType<typeof usePlaceEditMutations>['create'],
  world: PlacementWorld,
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
      const problem = placeNameProblem(world, state.creatingUnder, trimmed);
      if (problem !== null) {
        state.setError(problem);
        return;
      }
      if (requireOnline()) {
        mutation.mutate({ name: trimmed, parentId: state.creatingUnder });
      }
    },
    [mutation, requireOnline, state, world]
  );
  const cancelCreate = useCallback(() => state.setCreatingUnder(null), [state]);
  return { startCreate, commitCreate, cancelCreate };
}

/** Binds rename validation and mutation to the location edit state. */
export function useRenameActions(
  state: EditState,
  mutation: ReturnType<typeof usePlaceEditMutations>['rename'],
  world: PlacementWorld,
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
      const place = world.locations.get(state.renamingId);
      if (place === undefined) return;
      const problem = placeNameProblem(world, place.parentId, trimmed, place.id);
      if (problem !== null) {
        state.setError(problem);
        return;
      }
      if (requireOnline()) {
        mutation.mutate({ id: state.renamingId, name: trimmed });
      }
    },
    [mutation, requireOnline, state, world]
  );
  return { startRename, commitRename };
}

/** Binds the legacy move action to the place mutation adapter. */
export function useMoveAction(
  mutation: ReturnType<typeof usePlaceEditMutations>['move'],
  world: PlacementWorld,
  requireOnline: () => boolean
): Pick<PlaceEditsApi, 'moveTo'> {
  return {
    moveTo: (id: string, parentId: string | null): void => {
      if (!requireOnline()) return;
      const place = world.locations.get(id);
      if (place === undefined || place.parentId === parentId) return;
      const verdict = placeMoveVerdict(world, id, parentId);
      if (!verdict.ok) return;
      const parentName =
        parentId === null
          ? 'the top level'
          : (world.locations.get(parentId)?.name ?? 'the new place');
      mutation.mutate({
        id,
        name: place.name,
        parentId,
        previousParentId: place.parentId,
        parentName,
      });
    },
  };
}

import {
  useCreateActions,
  useMoveAction,
  useOnlineGuard,
  useRenameActions,
} from './location-page-place-actions.js';
import { usePlaceDeleteActions } from './location-page-place-delete-flow.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PendingDelete } from '../../foundation/places/delete-place-dialog.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { PlaceMutations } from '../../inventory-web/usePlaceMutations.js';
import type { EditState } from './location-page-edit-state.js';
import type { usePlaceEditMutations } from './location-page-edits-mutations.js';
import type { PlaceEditsApi } from './location-page-parts.js';

/** Composes all location-page place actions around the shared edit state. */
export function usePlaceEditActions({
  online,
  world,
  tallyOf,
  onDeleted,
  state,
  mutations,
  placeMutations,
}: {
  online: boolean;
  world: PlacementWorld;
  tallyOf: (id: string) => PlaceTally;
  onDeleted: (parentId: string | null) => void;
  state: EditState;
  mutations: ReturnType<typeof usePlaceEditMutations>;
  placeMutations: PlaceMutations;
}): Pick<
  PlaceEditsApi,
  | 'startCreate'
  | 'commitCreate'
  | 'cancelCreate'
  | 'startRename'
  | 'commitRename'
  | 'moveTo'
  | 'arrange'
  | 'setDeleteMode'
  | 'confirmDeletePlan'
  | 'requestDelete'
  | 'confirmDelete'
  | 'cancelDelete'
> & { pendingDelete: PendingDelete | null } {
  const requireOnline = useOnlineGuard(online, state.setError);
  const create = useCreateActions(state, mutations.create, world, requireOnline);
  const rename = useRenameActions(state, mutations.rename, world, requireOnline);
  const move = useMoveAction(mutations.move, world, requireOnline);
  const remove = usePlaceDeleteActions({
    online,
    world,
    tallyOf,
    onDeleted,
    state,
    mutations,
    placeMutations,
    requireOnline,
  });
  return { ...create, ...rename, ...move, ...remove };
}

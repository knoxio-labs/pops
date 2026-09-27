import { useState } from 'react';

import { usePlaceMutations } from '../../inventory-web/usePlaceMutations.js';
import { useDeleteEdits } from './use-place-delete-actions.js';
import { useCreateEdits, useMoveEdit, useRenameEdits } from './use-place-edit-actions.js';

import type { PlacementWorld } from '../model/placement-model.js';
import type { DeleteMode, DeletePlan } from './delete-plan.js';
import type { PendingDelete } from './place-edit-types.js';

export type { PendingDelete } from './place-edit-types.js';

/** Inputs for the shared place edit and delete controller. */
export interface PlaceEditsOptions {
  /** The location tree as a world; items are not read by edit validation. */
  world: PlacementWorld;
  offline: boolean;
  /** Called after a created place receives its server id. */
  onCreated?: (id: string) => void;
  /** Called after a delete plan is accepted, before its server request is sent. */
  onDeleted: (plan: DeletePlan) => void;
}

/** Shared place edit state and commands used by both place pages. */
export interface PlaceEditsApi {
  renamingId: string | null;
  /** Undefined means no create row; null means a root create row. */
  creatingUnder: string | null | undefined;
  deleting: PendingDelete | null;
  startRename: (id: string | null) => void;
  /** Returns a validation problem, or null once the name is accepted. */
  commitRename: (name: string) => string | null;
  startCreate: (parentId: string | null | undefined) => void;
  commitCreate: (name: string) => string | null;
  requestDelete: (id: string) => void;
  setDeleteMode: (mode: DeleteMode) => void;
  /** Does nothing when the plan is refused. */
  confirmDelete: (plan: DeletePlan) => void;
  cancelDelete: () => void;
  moveTo: (id: string, parentId: string | null) => void;
}

/** Binds validated place edits to the shared optimistic mutation actions. */
export function usePlaceEdits({
  world,
  offline,
  onCreated,
  onDeleted,
}: PlaceEditsOptions): PlaceEditsApi {
  const mutations = usePlaceMutations();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<PendingDelete | null>(null);
  const rename = useRenameEdits({ world, offline, renamingId, setRenamingId, mutations });
  const create = useCreateEdits({
    world,
    offline,
    creatingUnder,
    setCreatingUnder,
    onCreated,
    mutations,
  });
  const deletes = useDeleteEdits({ world, offline, deleting, setDeleting, onDeleted, mutations });
  const move = useMoveEdit({ world, offline, mutations });

  return {
    renamingId,
    creatingUnder,
    ...deletes,
    ...rename,
    ...create,
    ...move,
  };
}

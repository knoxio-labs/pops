/**
 * The edits a place takes from the tree and its panel: rename in place, a
 * new place typed inline under its parent, move through the picker, and
 * delete. Everything reversible lands at once with Undo; deleting a place
 * that holds things asks first, because a deleted place cannot come back.
 */
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { applyDelete, isEmptyPlace, planDelete } from './delete-plan';
import { createPlace, movePlace, placeNameProblem, renamePlace } from './tree-model';

import type { InventoryConcept, PlacementWorld } from '../foundation';
import type { DeleteMode, DeletePlan } from './delete-plan';

/** Commits a new world and offers Undo with a literal message. */
export type CommitWorld = (
  next: PlacementWorld,
  concept: InventoryConcept,
  message: string
) => void;

/** A delete waiting for its decision. */
export interface PendingDelete {
  placeId: string;
  mode: DeleteMode;
}

/** Review seeds for the edit states. `creatingUnder: null` is a new top-level place. */
export interface PlaceEditSeed {
  renamingId?: string | null;
  creatingUnder?: string | null;
  deleting?: PendingDelete | null;
}

/** What {@link usePlaceEdits} hands the page. */
export interface PlaceEditsApi {
  renamingId: string | null;
  /** Undefined: not creating. Null: creating at the top level. */
  creatingUnder: string | null | undefined;
  deleting: PendingDelete | null;
  startRename: (id: string | null) => void;
  /** Returns the problem with the name, or null once saved. */
  commitRename: (name: string) => string | null;
  startCreate: (parentId: string | null | undefined) => void;
  commitCreate: (name: string) => string | null;
  requestDelete: (id: string) => void;
  setDeleteMode: (mode: DeleteMode) => void;
  confirmDelete: (plan: DeletePlan) => void;
  cancelDelete: () => void;
  moveTo: (id: string, parentId: string | null) => void;
}

interface EditContext {
  world: PlacementWorld;
  commit: CommitWorld;
  setWorld: (next: PlacementWorld) => void;
  /** Selects and reveals a place after an edit puts it somewhere new. */
  reveal: (id: string) => void;
}

function nameOf(world: PlacementWorld, id: string): string {
  return world.locations.get(id)?.name ?? 'the place';
}

function useDeletes(ctx: EditContext, seed: PendingDelete | null) {
  const [deleting, setDeleting] = useState(seed);
  const requestDelete = useCallback(
    (id: string) => {
      if (!isEmptyPlace(ctx.world, id)) {
        const top = ctx.world.locations.get(id)?.parentId === null;
        setDeleting({ placeId: id, mode: top ? 'to-hand' : 'reparent' });
        return;
      }
      ctx.commit(
        applyDelete(ctx.world, planDelete(ctx.world, id, 'reparent')),
        'location',
        `Deleted ${nameOf(ctx.world, id)}`
      );
    },
    [ctx]
  );
  const confirmDelete = useCallback(
    (plan: DeletePlan) => {
      ctx.setWorld(applyDelete(ctx.world, plan));
      setDeleting(null);
      if (plan.parent !== null) ctx.reveal(plan.parent.id);
      toast(`Deleted ${plan.place.name}`);
    },
    [ctx]
  );
  const setDeleteMode = (mode: DeleteMode) =>
    setDeleting((current) => (current === null ? null : { ...current, mode }));
  return {
    deleting,
    requestDelete,
    confirmDelete,
    setDeleteMode,
    cancelDelete: () => setDeleting(null),
  };
}

/** Place edits over one world. */
export function usePlaceEdits(ctx: EditContext, seed: PlaceEditSeed): PlaceEditsApi {
  const [renamingId, startRename] = useState(seed.renamingId ?? null);
  const [creatingUnder, startCreate] = useState<string | null | undefined>(seed.creatingUnder);
  const deletes = useDeletes(ctx, seed.deleting ?? null);
  const commitRename = (name: string): string | null => {
    const place = renamingId === null ? undefined : ctx.world.locations.get(renamingId);
    if (place === undefined) return null;
    const problem = placeNameProblem(ctx.world, place.parentId, name, place.id);
    if (problem !== null) return problem;
    if (name.trim() !== place.name) {
      const message = `Renamed ${place.name} to ${name.trim()}`;
      ctx.commit(renamePlace(ctx.world, place.id, name), 'location', message);
    }
    startRename(null);
    return null;
  };
  const commitCreate = (name: string): string | null => {
    if (creatingUnder === undefined) return null;
    const problem = placeNameProblem(ctx.world, creatingUnder, name);
    if (problem !== null) return problem;
    const id = `loc-${crypto.randomUUID()}`;
    ctx.commit(
      createPlace(ctx.world, { id, name, parentId: creatingUnder }),
      'location',
      `Added ${name.trim()}`
    );
    startCreate(undefined);
    ctx.reveal(id);
    return null;
  };
  const moveTo = (id: string, parentId: string | null) => {
    const where = parentId === null ? 'the top level' : nameOf(ctx.world, parentId);
    ctx.commit(
      movePlace(ctx.world, id, parentId),
      'move',
      `Moved ${nameOf(ctx.world, id)} to ${where}`
    );
  };
  return {
    renamingId,
    creatingUnder,
    startRename,
    commitRename,
    startCreate,
    commitCreate,
    moveTo,
    ...deletes,
  };
}

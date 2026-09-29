import { useCallback } from 'react';
import { toast } from 'sonner';

import { showUndoToast } from '../feedback/undo-toast.js';
import { placeMoveVerdict, placeNameProblem } from './tree-model.js';

import type { usePlaceMutations } from '../../inventory-web/usePlaceMutations.js';
import type { PlacementWorld } from '../model/placement-model.js';

type PlaceMutations = ReturnType<typeof usePlaceMutations>;

interface RenameEditOptions {
  world: PlacementWorld;
  offline: boolean;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  mutations: PlaceMutations;
}

interface CreateEditOptions {
  world: PlacementWorld;
  offline: boolean;
  creatingUnder: string | null | undefined;
  setCreatingUnder: (id: string | null | undefined) => void;
  onCreated: ((id: string) => void) | undefined;
  mutations: PlaceMutations;
}

interface MoveEditOptions {
  world: PlacementWorld;
  offline: boolean;
  mutations: PlaceMutations;
}

function saveError(reason: unknown): void {
  const message =
    reason instanceof Error ? reason.message : 'The inventory service did not answer.';
  toast.error(`Not saved. ${message}`);
}

function nameOf(world: PlacementWorld, id: string): string {
  return world.locations.get(id)?.name ?? 'the place';
}

/** Binds rename validation and its undoable mutation to the place editor state. */
export function useRenameEdits({
  world,
  offline,
  renamingId,
  setRenamingId,
  mutations,
}: RenameEditOptions) {
  const startRename = useCallback(
    (id: string | null): void => {
      if (id !== null && offline) return;
      setRenamingId(id);
    },
    [offline, setRenamingId]
  );
  const commitRename = useCallback(
    (name: string): string | null => {
      if (renamingId === null || offline) return null;
      const place = world.locations.get(renamingId);
      if (place === undefined) return null;
      const problem = placeNameProblem(world, place.parentId, name, place.id);
      if (problem !== null) return problem;
      const trimmed = name.trim();
      setRenamingId(null);
      if (trimmed === place.name) return null;
      void mutations
        .rename(place.id, trimmed)
        .then(({ undo }) => {
          showUndoToast({
            concept: 'location',
            message: `Renamed ${place.name} to ${trimmed}`,
            onUndo: undo,
          });
        })
        .catch(saveError);
      return null;
    },
    [mutations, offline, renamingId, setRenamingId, world]
  );
  return { startRename, commitRename };
}

/** Binds create validation and its undoable mutation to the place editor state. */
export function useCreateEdits({
  world,
  offline,
  creatingUnder,
  setCreatingUnder,
  onCreated,
  mutations,
}: CreateEditOptions) {
  const startCreate = useCallback(
    (parentId: string | null | undefined): void => {
      if (parentId !== undefined && offline) return;
      setCreatingUnder(parentId);
    },
    [offline, setCreatingUnder]
  );
  const commitCreate = useCallback(
    (name: string): string | null => {
      if (creatingUnder === undefined || offline) return null;
      const problem = placeNameProblem(world, creatingUnder, name);
      if (problem !== null) return problem;
      const trimmed = name.trim();
      const parentId = creatingUnder;
      setCreatingUnder(undefined);
      void mutations
        .create(trimmed, parentId)
        .then(({ id, undo }) => {
          onCreated?.(id);
          showUndoToast({ concept: 'location', message: `Added ${trimmed}`, onUndo: undo });
        })
        .catch(saveError);
      return null;
    },
    [creatingUnder, mutations, offline, onCreated, setCreatingUnder, world]
  );
  return { startCreate, commitCreate };
}

/** Binds valid place reparenting and its undoable mutation to the place editor state. */
export function useMoveEdit({ world, offline, mutations }: MoveEditOptions) {
  const moveTo = useCallback(
    (id: string, parentId: string | null): void => {
      if (offline) return;
      const place = world.locations.get(id);
      if (place === undefined || !placeMoveVerdict(world, id, parentId).ok) return;
      const parentName = parentId === null ? 'the top level' : nameOf(world, parentId);
      void mutations
        .move(id, parentId)
        .then(({ undo }) => {
          showUndoToast({
            concept: 'move',
            message: `Moved ${place.name} to ${parentName}`,
            onUndo: undo,
          });
        })
        .catch(saveError);
    },
    [mutations, offline, world]
  );
  return { moveTo };
}

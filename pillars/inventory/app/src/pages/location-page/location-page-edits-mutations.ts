import { useMutation } from '@tanstack/react-query';

import { unwrap } from '../../inventory-api-helpers.js';
import { locationsCreate, locationsDelete, locationsUpdate } from '../../inventory-api/index.js';
import { inventoryErrorMessage, invalidateLocationData } from './location-page-utils.js';

import type { QueryClient } from '@tanstack/react-query';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceEditsApi, DeletePlaceState } from './location-page-parts.js';

/** Input for creating a child or root inventory place. */
export interface CreatePlaceInput {
  readonly name: string;
  readonly parentId: string | null;
}

/** Input for renaming an inventory place. */
export interface RenamePlaceInput {
  readonly id: string;
  readonly name: string;
}

/** Input for moving a place, including the data needed for undo. */
export interface MovePlaceInput {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly previousParentId: string | null;
  readonly parentName: string;
  readonly isUndo?: boolean;
}

/** Input for the two-step delete endpoint. */
export interface DeletePlaceInput {
  readonly state: DeletePlaceState;
  readonly force: boolean;
}

interface MutationOptions {
  readonly queryClient: QueryClient;
  readonly world: PlacementWorld;
  readonly setDeleting: (state: DeletePlaceState | null) => void;
  readonly setLastMove: (notice: PlaceEditsApi['lastMove']) => void;
  readonly setCreatingUnder: (id: string | null) => void;
  readonly setRenamingId: (id: string | null) => void;
  readonly setError: (message: string | null) => void;
  readonly onDeleted: (parentId: string | null) => void;
}

function useCreateMutation(
  queryClient: QueryClient,
  setCreatingUnder: (id: string | null) => void,
  setError: (message: string | null) => void
) {
  return useMutation({
    mutationFn: async ({ name, parentId }: CreatePlaceInput) =>
      unwrap(await locationsCreate({ body: { name, parentId, sortOrder: 0 } })),
    onSuccess: () => setCreatingUnder(null),
    onError: (reason: unknown) => setError(inventoryErrorMessage(reason)),
    onSettled: () => invalidateLocationData(queryClient),
  });
}

function useRenameMutation(
  queryClient: QueryClient,
  setRenamingId: (id: string | null) => void,
  setError: (message: string | null) => void
) {
  return useMutation({
    mutationFn: async ({ id, name }: RenamePlaceInput) =>
      unwrap(await locationsUpdate({ path: { id }, body: { name } })),
    onSuccess: () => setRenamingId(null),
    onError: (reason: unknown) => setError(inventoryErrorMessage(reason)),
    onSettled: () => invalidateLocationData(queryClient),
  });
}

function useMoveMutation(
  queryClient: QueryClient,
  world: PlacementWorld,
  setLastMove: (notice: PlaceEditsApi['lastMove']) => void,
  setError: (message: string | null) => void
) {
  const move = useMutation({
    mutationFn: async ({ id, parentId }: MovePlaceInput) =>
      unwrap(await locationsUpdate({ path: { id }, body: { parentId } })),
    onSuccess: (_result, input) => {
      if (input.isUndo === true) {
        setLastMove(null);
        return;
      }
      setLastMove({
        name: input.name,
        parentName: input.parentName,
        undo: () => {
          move.mutate({
            ...input,
            parentId: input.previousParentId,
            parentName: input.previousParentId
              ? (world.locations.get(input.previousParentId)?.name ?? 'its previous place')
              : 'the top level',
            isUndo: true,
          });
        },
      });
    },
    onError: (reason: unknown) => setError(inventoryErrorMessage(reason)),
    onSettled: () => invalidateLocationData(queryClient),
  });
  return move;
}

function useRemoveMutation(
  queryClient: QueryClient,
  setDeleting: (state: DeletePlaceState | null) => void,
  setError: (message: string | null) => void,
  onDeleted: (parentId: string | null) => void
) {
  return useMutation({
    mutationFn: async ({ state, force }: DeletePlaceInput) =>
      unwrap(
        await locationsDelete({ path: { id: state.id }, query: force ? { force: true } : {} })
      ),
    onSuccess: (result, input) => {
      if ('requiresConfirmation' in result) {
        setDeleting({
          ...input.state,
          ...result.stats,
          itemCount: result.stats.totalItemCount,
          requiresForce: true,
        });
        return;
      }
      setDeleting(null);
      onDeleted(input.state.parentId);
    },
    onError: (reason: unknown) => setError(inventoryErrorMessage(reason)),
    onSettled: () => invalidateLocationData(queryClient),
  });
}

/** Creates the page-local place mutations and their cache invalidation behavior. */
export function usePlaceEditMutations(options: MutationOptions) {
  const {
    queryClient,
    world,
    setDeleting,
    setLastMove,
    setCreatingUnder,
    setRenamingId,
    setError,
    onDeleted,
  } = options;
  const create = useCreateMutation(queryClient, setCreatingUnder, setError);
  const rename = useRenameMutation(queryClient, setRenamingId, setError);
  const move = useMoveMutation(queryClient, world, setLastMove, setError);
  const remove = useRemoveMutation(queryClient, setDeleting, setError, onDeleted);
  return { create, rename, move, remove };
}

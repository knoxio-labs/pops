/**
 * The entity CRUD + avatar/colour mutations behind `useEntitiesPage`, split
 * out so that hook's own file stays under the repo's per-file line budget.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';

import { unwrap, uploadEntityAvatar } from '../../contacts-api-helpers.js';
import {
  entitiesCreate,
  entitiesDelete,
  entitiesRemoveAvatar,
  entitiesRerollColour,
  entitiesUpdate,
} from '../../contacts-api/index.js';
import { type Entity } from './types';

import type { EntitiesCreateData } from '../../contacts-api/types.gen.js';

export type CreateEntityInput = NonNullable<EntitiesCreateData['body']>;

interface UpdateEntityInput {
  id: string;
  data: CreateEntityInput;
}

interface DeleteEntityInput {
  id: string;
}

/** Query key for the entity list (usage-augmented, finance-served). */
export const ENTITIES_KEY = ['contacts', 'entities'] as const;

interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingEntity: (e: Entity | null) => void;
  setDeletingId: (id: string | null) => void;
}

export function useEntityMutations(deps: MutationDeps) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY });

  const createMutation = useMutation({
    mutationFn: async (input: CreateEntityInput) => unwrap(await entitiesCreate({ body: input })),
    onSuccess: () => {
      toast.success('Entity created');
      deps.setIsDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async (input: UpdateEntityInput) =>
      unwrap(await entitiesUpdate({ path: { id: input.id }, body: input.data })),
    onSuccess: () => {
      toast.success('Entity updated');
      deps.setIsDialogOpen(false);
      deps.setEditingEntity(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: async (input: DeleteEntityInput) =>
      unwrap(await entitiesDelete({ path: { id: input.id } })),
    onSuccess: () => {
      toast.success('Entity deleted');
      deps.setDeletingId(null);
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  return { createMutation, updateMutation, deleteMutation };
}

/**
 * The dialog's dedicated avatar/colour mutations. Unlike create/update they
 * apply to an already-existing entity (avatar upload and colour reroll are
 * their own routes, gated on an id — POPS-3061) and keep the dialog open,
 * merging the fresh `avatarAssetId`/`colour` into `editingEntity` so its
 * preview updates without waiting for the list refetch.
 */
export function useEntityAssetMutations(setEditingEntity: Dispatch<SetStateAction<Entity | null>>) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY });
  const applyAssetFields = (updated: { avatarAssetId?: string | null; colour?: string | null }) =>
    setEditingEntity((current) =>
      current
        ? {
            ...current,
            avatarAssetId: updated.avatarAssetId ?? null,
            colour: updated.colour ?? null,
          }
        : current
    );

  const uploadAvatarMutation = useMutation({
    mutationFn: async (input: { id: string; file: File }) =>
      uploadEntityAvatar(input.id, input.file),
    onSuccess: applyAssetFields,
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const removeAvatarMutation = useMutation({
    mutationFn: async (input: { id: string }) =>
      unwrap(await entitiesRemoveAvatar({ path: { id: input.id } })).data,
    onSuccess: applyAssetFields,
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const rerollColourMutation = useMutation({
    mutationFn: async (input: { id: string }) =>
      unwrap(await entitiesRerollColour({ path: { id: input.id } })).data,
    onSuccess: applyAssetFields,
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  return { uploadAvatarMutation, removeAvatarMutation, rerollColourMutation };
}

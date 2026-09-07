import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../contacts-api-helpers.js';
import { entitiesCreate, entitiesUpdate } from '../../contacts-api/index.js';
import { type Entity, type ENTITY_TYPES, type EntityFormValues } from './types';
import { useEntityAvatarMutations } from './useEntityAvatarMutations';
import { useEntityFormDialogState } from './useEntityFormDialogState';

import type { Dispatch, SetStateAction } from 'react';

import type { EntitiesCreateData } from '../../contacts-api/types.gen.js';

type CreateEntityInput = NonNullable<EntitiesCreateData['body']>;

/** Query key for the entity list (usage-augmented, finance-served) and any per-entity read. */
export const ENTITIES_KEY = ['contacts', 'entities'] as const;

function toCreateInput(values: EntityFormValues): CreateEntityInput {
  return {
    name: values.name,
    type: values.type as (typeof ENTITY_TYPES)[number],
    abn: values.abn || null,
    aliases: values.aliases,
    defaultTransactionType: values.defaultTransactionType || null,
    defaultTags: values.defaultTags,
    notes: values.notes || null,
  };
}

/**
 * Reconciles an avatar/colour mutation's response onto `editingEntity` by id:
 * the mutation can resolve after the dialog has moved on to another entity
 * (or closed), so a stale response must not clobber whatever is showing now.
 */
function useEntityIdentityMutations(setEditingEntity: Dispatch<SetStateAction<Entity | null>>) {
  const applyEntityChange = (updated: Omit<Entity, 'transactionCount'>) =>
    setEditingEntity((current) =>
      current?.id === updated.id ? { ...current, ...updated } : current
    );
  return useEntityAvatarMutations(applyEntityChange);
}

/**
 * The entity form dialog's full lifecycle — open/close, create-vs-edit,
 * mutations and submit — shared between the entities list (add and edit) and
 * the entity detail page (edit only, opened straight into `handleEdit`, the
 * same shape `useAccountFormDialog` gives the account dashboard). Neither
 * caller duplicates this; they differ only in when they call `handleAdd` vs
 * `handleEdit`.
 */
export function useEntityFormDialog() {
  const dialog = useEntityFormDialogState();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY });

  const createMutation = useMutation({
    mutationFn: async (input: CreateEntityInput) => unwrap(await entitiesCreate({ body: input })),
    onSuccess: () => {
      toast.success('Entity created');
      dialog.closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; data: CreateEntityInput }) =>
      unwrap(await entitiesUpdate({ path: { id: input.id }, body: input.data })),
    onSuccess: () => {
      toast.success('Entity updated');
      dialog.closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });
  const identityMutations = useEntityIdentityMutations(dialog.setEditingEntity);

  const onSubmit = (values: EntityFormValues) => {
    const payload = toCreateInput(values);
    if (dialog.editingEntity) updateMutation.mutate({ id: dialog.editingEntity.id, data: payload });
    else createMutation.mutate(payload);
  };

  return {
    ...dialog,
    onSubmit,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    uploadAvatar: identityMutations.uploadAvatar,
    removeAvatar: identityMutations.removeAvatar,
    avatarUploadIsPending: identityMutations.uploadIsPending,
    avatarRemoveIsPending: identityMutations.removeIsPending,
    rerollColour: identityMutations.rerollColour,
    colourRerollIsPending: identityMutations.rerollIsPending,
    onAvatarError: (message: string) => toast.error(message),
  };
}

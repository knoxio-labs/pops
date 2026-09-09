/**
 * Avatar upload/remove + colour reroll mutations for the entity edit dialog.
 * Split out of `useEntitiesPage`: the dialog needs the freshly-mutated entity
 * back to show the new avatar/colour without closing, a different success
 * shape from the name/type PATCH the list re-fetches for.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../contacts-api-helpers.js';
import {
  entitiesRemoveAvatar,
  entitiesRerollColour,
  entitiesUploadAvatar,
} from '../../contacts-api/index.js';
import { type Entity } from './types';

import type { Entity as ContactEntity } from '../../contacts-api/types.gen.js';

const ENTITIES_KEY = ['contacts', 'entities'] as const;

/**
 * The generated contacts `Entity` type marks every nullable field optional
 * (absent-or-null on the wire); the page's own `Entity` — shared with the
 * finance-served usage rollup, which always projects every field — requires
 * them present. Only the fields this dialog actually reads back need
 * normalizing; `transactionCount` stays off since these mutations never
 * change it and the caller merges onto the entity already showing.
 */
export function toPageEntity(entity: ContactEntity): Omit<Entity, 'transactionCount'> {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    abn: entity.abn ?? null,
    aliases: entity.aliases,
    defaultTransactionType: entity.defaultTransactionType ?? null,
    defaultTags: entity.defaultTags,
    notes: entity.notes ?? null,
    lastEditedTime: entity.lastEditedTime,
    avatarAssetId: entity.avatarAssetId ?? null,
    colour: entity.colour ?? null,
  };
}

/**
 * The route stores the request's `Content-Type` as the blob's own and rejects
 * anything outside its image allowlist, so the wrapper's declared
 * `application/octet-stream` default has to be replaced with the file's real
 * type — the spec naming a media type the server always refuses is POPS-3244.
 */
async function uploadEntityAvatar(entityId: string, file: File) {
  return unwrap(
    await entitiesUploadAvatar({
      path: { id: entityId },
      body: file,
      headers: { 'Content-Type': file.type },
    })
  );
}

/**
 * @param onChanged Receives the entity row the server returned. Can fire
 * after the dialog that started the mutation has moved on to another entity
 * — or closed — so the caller reconciles the row's identity itself rather
 * than applying it blindly.
 */
export function useEntityAvatarMutations(
  onChanged: (entity: Omit<Entity, 'transactionCount'>) => void
) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ENTITIES_KEY });

  const uploadMutation = useMutation({
    mutationFn: (args: { entityId: string; file: File }) =>
      uploadEntityAvatar(args.entityId, args.file),
    onSuccess: (res) => {
      onChanged(toPageEntity(res.data));
      toast.success('Avatar uploaded');
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (entityId: string) =>
      unwrap(await entitiesRemoveAvatar({ path: { id: entityId } })),
    onSuccess: (res) => {
      onChanged(toPageEntity(res.data));
      toast.success('Avatar removed');
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  const rerollMutation = useMutation({
    mutationFn: async (entityId: string) =>
      unwrap(await entitiesRerollColour({ path: { id: entityId } })),
    onSuccess: (res) => {
      onChanged(toPageEntity(res.data));
      toast.success('Colour rerolled');
    },
    onError: (err: Error) => toast.error(err.message),
    onSettled: invalidate,
  });

  const uploadAvatar = useCallback(
    (entityId: string, file: File) => uploadMutation.mutate({ entityId, file }),
    [uploadMutation]
  );

  return {
    uploadAvatar,
    removeAvatar: removeMutation.mutate,
    rerollColour: rerollMutation.mutate,
    uploadIsPending: uploadMutation.isPending,
    removeIsPending: removeMutation.isPending,
    rerollIsPending: rerollMutation.isPending,
  };
}

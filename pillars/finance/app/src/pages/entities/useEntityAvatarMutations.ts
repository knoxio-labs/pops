/**
 * Avatar upload/remove + colour reroll mutations for the entity edit dialog.
 * Split out of `useEntitiesPage` for the same reason
 * `useInstitutionLogoMutations` is split from `useInstitutionsSettings`: the
 * dialog needs the freshly-mutated entity back to show the new avatar/colour
 * without closing, a different success shape from the name/type PATCH the
 * list re-fetches for.
 *
 * `entitiesUploadAvatar` (the generated SDK wrapper) is unsafe to call as-is:
 * its `body` type is `Array<number>`, generated from the Rust route's
 * `Vec<u8>` schema, but the wrapper also sets `bodySerializer: null` so
 * whatever `body` value is passed goes straight to `fetch` unmodified — a
 * plain number array is not valid `BodyInit` and gets silently coerced to its
 * comma-joined string form (verified: `new Request(url, { body: [1,2,3] })`
 * sends the bytes of the string "1,2,3", not the three bytes themselves).
 * The fix belongs in the contacts pillar's OpenAPI generation for binary
 * bodies (POPS-3091); until then this calls the underlying `client.put`
 * directly with a real `Uint8Array`, which `RequestOptions.body` types as
 * `unknown` and which `fetch`/`Request` accept correctly.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../contacts-api-helpers.js';
import { client } from '../../contacts-api/client.gen.js';
import { entitiesRemoveAvatar, entitiesRerollColour } from '../../contacts-api/index.js';
import { type Entity } from './types';

import type {
  EntitiesUploadAvatarErrors,
  EntitiesUploadAvatarResponses,
  Entity as ContactEntity,
} from '../../contacts-api/types.gen.js';

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

async function uploadEntityAvatar(entityId: string, file: File) {
  const body = new Uint8Array(await file.arrayBuffer());
  return unwrap(
    await client.put<EntitiesUploadAvatarResponses, EntitiesUploadAvatarErrors>({
      url: '/entities/{id}/avatar',
      path: { id: entityId },
      body,
      bodySerializer: null,
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

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap, uploadEntityAvatar } from '../../contacts-api-helpers.js';
import {
  entitiesCreate,
  entitiesDelete,
  entitiesRemoveAvatar,
  entitiesRerollColour,
  entitiesUpdate,
} from '../../contacts-api/index.js';
import { unwrap as unwrapFinance } from '../../finance-api-helpers.js';
import { entityUsageList } from '../../finance-api/index.js';
import { fetchAllPages } from '../../lib/fetch-all-pages';
import {
  DEFAULT_FORM_VALUES,
  type Entity,
  type EntityFormValues,
  EntityFormSchema,
  type ENTITY_TYPES,
} from './types';

import type { EntitiesCreateData } from '../../contacts-api/types.gen.js';

type CreateEntityInput = NonNullable<EntitiesCreateData['body']>;

interface UpdateEntityInput {
  id: string;
  data: CreateEntityInput;
}

interface DeleteEntityInput {
  id: string;
}

/** Query key for the entity list (usage-augmented, finance-served). */
const ENTITIES_KEY = ['contacts', 'entities'] as const;

interface MutationDeps {
  setIsDialogOpen: (v: boolean) => void;
  setEditingEntity: (e: Entity | null) => void;
  setDeletingId: (id: string | null) => void;
}

function useEntityMutations(deps: MutationDeps) {
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
function useEntityAssetMutations(setEditingEntity: Dispatch<SetStateAction<Entity | null>>) {
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

function buildDialogHandlers(
  form: UseFormReturn<EntityFormValues>,
  setEditingEntity: (e: Entity | null) => void,
  setIsDialogOpen: (v: boolean) => void
) {
  const handleAdd = () => {
    setEditingEntity(null);
    form.reset(DEFAULT_FORM_VALUES);
    setIsDialogOpen(true);
  };
  const handleEdit = (entity: Entity) => {
    setEditingEntity(entity);
    form.reset({
      name: entity.name,
      type: entity.type ?? 'company',
      abn: entity.abn ?? '',
      aliases: entity.aliases,
      defaultTransactionType: entity.defaultTransactionType ?? '',
      defaultTags: entity.defaultTags,
      notes: entity.notes ?? '',
    });
    setIsDialogOpen(true);
  };
  return { handleAdd, handleEdit };
}

function buildSubmit(
  editingEntity: Entity | null,
  createMutation: ReturnType<typeof useEntityMutations>['createMutation'],
  updateMutation: ReturnType<typeof useEntityMutations>['updateMutation']
) {
  return (values: EntityFormValues) => {
    const payload: CreateEntityInput = {
      name: values.name,
      type: values.type as (typeof ENTITY_TYPES)[number],
      abn: values.abn || null,
      aliases: values.aliases,
      defaultTransactionType: values.defaultTransactionType || null,
      defaultTags: values.defaultTags,
      notes: values.notes || null,
    };
    if (editingEntity) updateMutation.mutate({ id: editingEntity.id, data: payload });
    else createMutation.mutate(payload);
  };
}

export function useEntitiesPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showOrphanedOnly, setShowOrphanedOnly] = useState(false);

  // The list (with per-entity transactionCount + the orphaned filter) is the
  // finance-owned usage rollup; contacts' plain entities CRUD carries neither.
  const orphanedOnly = showOrphanedOnly ? ('true' as const) : undefined;
  const query = useQuery({
    queryKey: [...ENTITIES_KEY, 'list', 'all', { orphanedOnly }],
    queryFn: async () =>
      fetchAllPages(async (page) =>
        unwrapFinance(await entityUsageList({ query: { ...page, orphanedOnly } }))
      ),
  });
  const { createMutation, updateMutation, deleteMutation } = useEntityMutations({
    setIsDialogOpen,
    setEditingEntity,
    setDeletingId,
  });
  const { uploadAvatarMutation, removeAvatarMutation, rerollColourMutation } =
    useEntityAssetMutations(setEditingEntity);
  const form = useForm<EntityFormValues>({
    resolver: standardSchemaResolver(EntityFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const { handleAdd, handleEdit } = buildDialogHandlers(form, setEditingEntity, setIsDialogOpen);

  return {
    query,
    form,
    isDialogOpen,
    setIsDialogOpen,
    editingEntity,
    deletingId,
    setDeletingId,
    showOrphanedOnly,
    setShowOrphanedOnly,
    deleteMutation,
    uploadAvatarMutation,
    removeAvatarMutation,
    rerollColourMutation,
    handleAdd,
    handleEdit,
    onSubmit: buildSubmit(editingEntity, createMutation, updateMutation),
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
}

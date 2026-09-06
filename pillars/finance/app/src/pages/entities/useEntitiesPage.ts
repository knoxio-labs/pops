import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { unwrap as unwrapFinance } from '../../finance-api-helpers.js';
import { entityUsageList } from '../../finance-api/index.js';
import { fetchAllPages } from '../../lib/fetch-all-pages';
import {
  ENTITIES_KEY,
  useEntityAssetMutations,
  useEntityMutations,
  type CreateEntityInput,
} from './entity-mutations';
import {
  DEFAULT_FORM_VALUES,
  type Entity,
  type EntityFormValues,
  EntityFormSchema,
  type ENTITY_TYPES,
} from './types';

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

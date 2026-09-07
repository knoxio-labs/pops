import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { DEFAULT_FORM_VALUES, type Entity, EntityFormSchema, type EntityFormValues } from './types';

/**
 * Which entity (if any) the dialog is editing, and the form bound to it.
 *
 * `handleEdit` seeds the form with an explicit `form.reset(...)` rather than
 * relying on `useForm`'s `defaultValues` (read once, on mount): the dialog
 * and its form instance stay mounted across opens, so a second `handleEdit`
 * call for a different entity — or the same one, after an unsaved edit — must
 * overwrite whatever is currently in the fields, not merely seed an instance
 * that already has values.
 */
export function useEntityFormDialogState() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const form = useForm<EntityFormValues>({
    resolver: standardSchemaResolver(EntityFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingEntity(null);
  };
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

  return {
    form,
    isDialogOpen,
    setIsDialogOpen: (open: boolean) => (open ? setIsDialogOpen(true) : closeDialog()),
    editingEntity,
    setEditingEntity,
    closeDialog,
    handleAdd,
    handleEdit,
  };
}

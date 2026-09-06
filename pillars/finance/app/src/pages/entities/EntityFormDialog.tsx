import { Loader2 } from 'lucide-react';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import {
  Button,
  ChipInput,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  Textarea,
  TextInput,
} from '@pops/ui';

import { EntityAvatarField } from './EntityAvatarField';
import { EntityColourField } from './EntityColourField';
import {
  ENTITY_DEFAULT_TYPE_OPTIONS,
  ENTITY_TYPES,
  type Entity,
  type EntityFormValues,
} from './types';

import type { useEntitiesPage } from './useEntitiesPage';

interface EntityFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingEntity: Entity | null;
  form: UseFormReturn<EntityFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: EntityFormValues) => void;
  uploadAvatarMutation: ReturnType<typeof useEntitiesPage>['uploadAvatarMutation'];
  removeAvatarMutation: ReturnType<typeof useEntitiesPage>['removeAvatarMutation'];
  rerollColourMutation: ReturnType<typeof useEntitiesPage>['rerollColourMutation'];
}

/**
 * Avatar upload/remove and colour reroll — shown only once the entity
 * exists, since both are dedicated routes keyed on the entity id
 * (`PUT`/`DELETE /entities/{id}/avatar`, `POST /entities/{id}/colour/reroll`)
 * rather than fields on the create/update body (POPS-3061).
 */
function IdentityFields({
  entity,
  uploadAvatarMutation,
  removeAvatarMutation,
  rerollColourMutation,
}: {
  entity: Entity;
  uploadAvatarMutation: EntityFormDialogProps['uploadAvatarMutation'];
  removeAvatarMutation: EntityFormDialogProps['removeAvatarMutation'];
  rerollColourMutation: EntityFormDialogProps['rerollColourMutation'];
}) {
  return (
    <>
      <EntityAvatarField
        entity={entity}
        uploadAvatar={(file) => uploadAvatarMutation.mutate({ id: entity.id, file })}
        removeAvatar={() => removeAvatarMutation.mutate({ id: entity.id })}
        uploadIsPending={uploadAvatarMutation.isPending}
        removeIsPending={removeAvatarMutation.isPending}
        onError={(message) => toast.error(message)}
      />
      <EntityColourField
        colour={entity.colour}
        onReroll={() => rerollColourMutation.mutate({ id: entity.id })}
        isPending={rerollColourMutation.isPending}
      />
    </>
  );
}

function NameAndType({ form }: { form: UseFormReturn<EntityFormValues> }) {
  return (
    <>
      <TextInput
        label="Name"
        placeholder="e.g. Woolworths, Netflix"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Type"
          options={ENTITY_TYPES.map((t) => ({
            label: t.charAt(0).toUpperCase() + t.slice(1),
            value: t,
          }))}
          {...form.register('type')}
        />
        <TextInput label="ABN (Optional)" placeholder="00 000 000 000" {...form.register('abn')} />
      </div>
    </>
  );
}

function TagsAndAliases({ form }: { form: UseFormReturn<EntityFormValues> }) {
  return (
    <>
      <div className="space-y-2">
        <Label>Aliases</Label>
        <Controller
          control={form.control}
          name="aliases"
          render={({ field }) => (
            <ChipInput
              placeholder="Type and press Enter..."
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <Select
        label="Default Transaction Type (Optional)"
        options={ENTITY_DEFAULT_TYPE_OPTIONS}
        {...form.register('defaultTransactionType')}
      />
      <div className="space-y-2">
        <Label>Default Tags</Label>
        <Controller
          control={form.control}
          name="defaultTags"
          render={({ field }) => (
            <ChipInput
              placeholder="Type and press Enter..."
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      <div className="space-y-2">
        <Label>Notes (Optional)</Label>
        <Textarea placeholder="Additional details..." {...form.register('notes')} />
      </div>
    </>
  );
}

export function EntityFormDialog(props: EntityFormDialogProps) {
  const {
    open,
    onOpenChange,
    editingEntity,
    form,
    isSubmitting,
    onSubmit,
    uploadAvatarMutation,
    removeAvatarMutation,
    rerollColourMutation,
  } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-125">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editingEntity ? 'Edit Entity' : 'New Entity'}</DialogTitle>
            <DialogDescription className="sr-only">
              Enter the details for this entity
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {editingEntity && (
              <IdentityFields
                entity={editingEntity}
                uploadAvatarMutation={uploadAvatarMutation}
                removeAvatarMutation={removeAvatarMutation}
                rerollColourMutation={rerollColourMutation}
              />
            )}
            <NameAndType form={form} />
            <TagsAndAliases form={form} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingEntity ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

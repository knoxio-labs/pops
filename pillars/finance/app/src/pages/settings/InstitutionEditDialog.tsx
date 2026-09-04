import { Loader2 } from 'lucide-react';
import { type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TextInput,
} from '@pops/ui';

import { InstitutionLogoField } from './InstitutionLogoField';
import { type Institution, type InstitutionFormValues } from './types';

interface InstitutionEditDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: UseFormReturn<InstitutionFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: InstitutionFormValues) => void;
  /** The institution being edited — `null` only while the dialog is closing. */
  editing: Institution | null;
  uploadLogo: (institutionId: string, file: File) => void;
  removeLogo: (institutionId: string) => void;
  logoUploadIsPending: boolean;
  logoRemoveIsPending: boolean;
}

function FormFields({ form }: { form: UseFormReturn<InstitutionFormValues> }) {
  const colour = form.watch('colour');
  return (
    <div className="grid gap-4 py-4">
      <TextInput
        label="Name"
        placeholder="e.g. Westpac"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <TextInput
            label="Colour"
            placeholder="#rrggbb"
            {...form.register('colour')}
            error={form.formState.errors.colour?.message}
          />
        </div>
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(colour) ? colour : '#000000'}
          onChange={(e) => form.setValue('colour', e.target.value, { shouldValidate: true })}
          className="h-11 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
          aria-label="Colour swatch"
        />
      </div>
    </div>
  );
}

export function InstitutionEditDialog(props: InstitutionEditDialogProps) {
  const {
    open,
    onOpenChange,
    form,
    isSubmitting,
    onSubmit,
    editing,
    uploadLogo,
    removeLogo,
    logoUploadIsPending,
    logoRemoveIsPending,
  } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-(--size-dialog-sm)">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit institution</DialogTitle>
            <DialogDescription className="sr-only">
              Rename this institution or change its colour
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <InstitutionLogoField
              institution={editing}
              uploadLogo={uploadLogo}
              removeLogo={removeLogo}
              uploadIsPending={logoUploadIsPending}
              removeIsPending={logoRemoveIsPending}
              onError={(message) => toast.error(message)}
            />
          )}
          <FormFields form={form} />
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
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

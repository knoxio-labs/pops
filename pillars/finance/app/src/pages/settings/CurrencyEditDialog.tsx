import { Loader2 } from 'lucide-react';
import { type UseFormReturn } from 'react-hook-form';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  TextInput,
} from '@pops/ui';

import { CURRENCY_KIND_OPTIONS, type CurrencyFormValues } from './types';

interface CurrencyEditDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  code: string | null;
  form: UseFormReturn<CurrencyFormValues>;
  isSubmitting: boolean;
  onSubmit: (values: CurrencyFormValues) => void;
}

function FormFields({ form }: { form: UseFormReturn<CurrencyFormValues> }) {
  return (
    <div className="grid gap-4 py-4">
      <TextInput
        label="Name"
        placeholder="e.g. Australian Dollar"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <TextInput
        label="Symbol (optional)"
        placeholder="e.g. $"
        {...form.register('symbol')}
        error={form.formState.errors.symbol?.message}
      />
      <TextInput
        label="Decimals"
        type="number"
        min="0"
        step="1"
        {...form.register('decimals')}
        error={form.formState.errors.decimals?.message}
      />
      <Select
        label="Kind"
        options={CURRENCY_KIND_OPTIONS}
        {...form.register('kind')}
        error={form.formState.errors.kind?.message}
      />
      <p className="text-2xs text-muted-foreground">
        Changing decimals is refused if any account already uses this currency.
      </p>
    </div>
  );
}

export function CurrencyEditDialog(props: CurrencyEditDialogProps) {
  const { open, onOpenChange, code, form, isSubmitting, onSubmit } = props;
  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-(--size-dialog-sm)">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit currency {code}</DialogTitle>
            <DialogDescription className="sr-only">
              Edit this currency&apos;s name, symbol, decimals and kind
            </DialogDescription>
          </DialogHeader>
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

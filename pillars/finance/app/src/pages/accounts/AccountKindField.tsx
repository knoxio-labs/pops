import { Controller, type UseFormReturn } from 'react-hook-form';

import { ACCOUNT_KIND_META, ComboboxSelect, Label } from '@pops/ui';

import { KIND_FORM_OPTIONS, type AccountFormValues } from './types';

const KIND_OPTIONS = KIND_FORM_OPTIONS.map((o) => ({
  value: o.value,
  label: o.disabled
    ? `${ACCOUNT_KIND_META[o.value].label} (not yet)`
    : ACCOUNT_KIND_META[o.value].label,
  disabled: o.disabled,
}));

/** The kind combobox (design decision: a `ComboboxSelect`, not a native `<select>`), reserved kinds present but disabled. */
export function AccountKindField({ form }: { form: UseFormReturn<AccountFormValues> }) {
  return (
    <div className="space-y-1.5">
      <Label>Kind</Label>
      <Controller
        control={form.control}
        name="kind"
        render={({ field }) => (
          <ComboboxSelect
            options={KIND_OPTIONS}
            value={field.value}
            onChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              if (next !== undefined) field.onChange(next);
            }}
          />
        )}
      />
      {form.formState.errors.kind?.message && (
        <p className="text-2xs font-medium text-destructive ml-1">
          {form.formState.errors.kind.message}
        </p>
      )}
    </div>
  );
}

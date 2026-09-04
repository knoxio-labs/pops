import { Controller, type UseFormReturn } from 'react-hook-form';

import { AccountSelect, type AccountOption, Label, Select } from '@pops/ui';

import { TRANSACTION_TYPE_OPTIONS, type TransactionFormValues } from './types';

function AccountField({
  form,
  accounts,
}: {
  form: UseFormReturn<TransactionFormValues>;
  accounts: AccountOption[];
}) {
  return (
    <div className="space-y-2">
      <Label>Account</Label>
      <Controller
        control={form.control}
        name="accountId"
        render={({ field }) => (
          <AccountSelect
            aria-label="Account"
            accounts={accounts}
            value={field.value || undefined}
            onChange={(accountId) => field.onChange(accountId)}
            placeholder="Select account..."
          />
        )}
      />
      {form.formState.errors.accountId?.message && (
        <p className="text-sm text-destructive">{form.formState.errors.accountId.message}</p>
      )}
    </div>
  );
}

export function AccountAndType({
  form,
  accounts,
}: {
  form: UseFormReturn<TransactionFormValues>;
  accounts: AccountOption[];
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <AccountField form={form} accounts={accounts} />
      <Select
        label="Type"
        options={TRANSACTION_TYPE_OPTIONS}
        {...form.register('type')}
        error={form.formState.errors.type?.message}
      />
    </div>
  );
}

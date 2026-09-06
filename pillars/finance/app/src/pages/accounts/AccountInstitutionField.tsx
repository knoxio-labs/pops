import { Controller, type UseFormReturn } from 'react-hook-form';

import { InstitutionSelect, type BankEntityOption } from './InstitutionSelect';
import { hasInstitution, type AccountFormValues } from './types';

/** The institution picker, shown for every kind except `cash` and `person` (`rest-accounts.ts`: neither has an issuing institution). */
export function AccountInstitutionField({
  form,
  bankEntities,
  onCreate,
}: {
  form: UseFormReturn<AccountFormValues>;
  bankEntities: BankEntityOption[];
  onCreate: (name: string) => void;
}) {
  const kind = form.watch('kind');
  if (!hasInstitution(kind)) return null;
  return (
    <Controller
      control={form.control}
      name="entityId"
      render={({ field }) => (
        <InstitutionSelect
          entities={bankEntities}
          value={field.value}
          onChange={field.onChange}
          onCreate={onCreate}
        />
      )}
    />
  );
}

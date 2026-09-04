import { Controller, type UseFormReturn } from 'react-hook-form';

import { InstitutionSelect } from './InstitutionSelect';
import { hasInstitution, type AccountFormValues, type Institution } from './types';

/** The institution picker, shown for every kind except `cash` and `person` (`rest-accounts.ts`: neither has an issuing institution). */
export function AccountInstitutionField({
  form,
  institutions,
  onCreate,
}: {
  form: UseFormReturn<AccountFormValues>;
  institutions: Institution[];
  onCreate: (name: string) => void;
}) {
  const kind = form.watch('kind');
  if (!hasInstitution(kind)) return null;
  return (
    <Controller
      control={form.control}
      name="institutionId"
      render={({ field }) => (
        <InstitutionSelect
          institutions={institutions}
          value={field.value}
          onChange={field.onChange}
          onCreate={onCreate}
        />
      )}
    />
  );
}

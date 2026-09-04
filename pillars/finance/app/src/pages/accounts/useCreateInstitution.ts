import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import { institutionsCreate } from '../../finance-api/index.js';
import { colourFromName } from './InstitutionSelect';

import type { AccountFormValues } from './types';

/**
 * Mints an institution inline from `InstitutionSelect`'s create row, then
 * selects it on the form's `institutionId` — the picker's own `onCreate`
 * only hands back the typed name, so this is where the rest of
 * `institutionsCreate`'s required body gets filled in (see
 * `colourFromName`'s docstring for why the colour is generated rather than
 * asked for).
 */
export function useCreateInstitution(form: UseFormReturn<AccountFormValues>) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (name: string) =>
      unwrap(await institutionsCreate({ body: { name, colour: colourFromName(name) } })),
    onSuccess: (result) => {
      form.setValue('institutionId', result.data.id);
      void queryClient.invalidateQueries({ queryKey: ['finance', 'institutions', 'list'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (name: string) => mutation.mutate(name);
}

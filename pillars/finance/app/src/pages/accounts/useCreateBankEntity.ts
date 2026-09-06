import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { unwrap } from '../../contacts-api-helpers.js';
import { entitiesCreate } from '../../contacts-api/index.js';

import type { AccountFormValues } from './types';

/** The contacts entity `type` a bank/institution is created as (POPS-3061/3062). */
const BANK_ENTITY_TYPE = 'bank';

/**
 * Mints a `bank`-typed contacts Entity inline from `InstitutionSelect`'s
 * create row, then selects it on the form's `entityId` directly (POPS-3063)
 * — no `institutions` table involved for a NEW account. Colour is assigned
 * server-side by contacts at creation; there is nothing for this hook to
 * generate or pass in.
 */
export function useCreateBankEntity(form: UseFormReturn<AccountFormValues>) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (name: string) =>
      unwrap(await entitiesCreate({ body: { name, type: BANK_ENTITY_TYPE } })),
    onSuccess: (result) => {
      form.setValue('entityId', result.data.id);
      void queryClient.invalidateQueries({
        queryKey: ['contacts', 'entities', 'list', 'all', BANK_ENTITY_TYPE],
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return (name: string) => mutation.mutate(name);
}

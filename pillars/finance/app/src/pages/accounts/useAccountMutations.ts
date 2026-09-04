import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import { accountsCreate, accountsUpdate, giftCardDetailsWrite } from '../../finance-api/index.js';
import { hasInstitution, type AccountFormValues } from './types';

export const ACCOUNTS_KEY = ['finance', 'accounts', 'page'] as const;

async function writeGiftCardDetails(accountId: string, values: AccountFormValues) {
  if (values.giftCardNumber === '' || values.giftCardPin === '') return;
  await unwrap(
    await giftCardDetailsWrite({
      path: { id: accountId },
      body: {
        number: values.giftCardNumber,
        pin: values.giftCardPin,
        expiresOn: values.giftCardExpiresOn || null,
      },
    })
  );
}

function toAccountPayload(values: AccountFormValues) {
  return {
    name: values.name,
    kind: values.kind,
    institutionId: hasInstitution(values.kind) ? values.institutionId : null,
    currency: values.currency,
  };
}

/** Create/update mutations for the accounts form, including the gift-card-details follow-up write. */
export function useAccountMutations(onSuccess: () => void) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });

  const createMutation = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      const created = unwrap(await accountsCreate({ body: toAccountPayload(values) }));
      if (values.kind === 'gift-card') await writeGiftCardDetails(created.data.id, values);
      return created;
    },
    onSuccess: () => {
      toast.success('Account created');
      onSuccess();
    },
    onSettled: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: AccountFormValues }) => {
      const updated = unwrap(
        await accountsUpdate({ path: { id }, body: toAccountPayload(values) })
      );
      if (values.kind === 'gift-card') await writeGiftCardDetails(id, values);
      return updated;
    },
    onSuccess: () => {
      toast.success('Account updated');
      onSuccess();
    },
    onSettled: invalidate,
  });
  return { createMutation, updateMutation };
}

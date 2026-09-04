import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ALL_ACCOUNTS_KEY } from '../../components/accounts/hooks/useAllAccounts';
import { unwrap } from '../../finance-api-helpers.js';
import { accountsCreate, accountsUpdate, giftCardDetailsWrite } from '../../finance-api/index.js';
import { hasInstitution, type AccountFormValues } from './types';

import type { Account } from './types';

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
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    void queryClient.invalidateQueries({ queryKey: ALL_ACCOUNTS_KEY });
  };

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
  const archiveMutation = useMutation({
    mutationFn: async ({ id, archivedAt }: { id: string; archivedAt: string | null }) =>
      unwrap(await accountsUpdate({ path: { id }, body: { archivedAt } })),
    onSuccess: (_, variables) => {
      toast.success(variables.archivedAt !== null ? 'Account archived' : 'Account unarchived');
      onSuccess();
    },
    onSettled: invalidate,
  });
  return { createMutation, updateMutation, archiveMutation };
}

/** Toggle an account's `archivedAt`, stamping the current time to archive or clearing it to unarchive. */
export function toggleArchived(account: Pick<Account, 'archivedAt'>): string | null {
  return account.archivedAt !== null ? null : new Date().toISOString();
}

import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import { accountsList, currenciesList, institutionsList } from '../../finance-api/index.js';
import { fetchAllPages } from '../../lib/fetch-all-pages';
import { mapAccountApiError } from './account-error-mapping';
import { type AccountFormValues } from './types';
import { useAccountFormDialogState } from './useAccountFormDialogState';
import { ACCOUNTS_KEY, useAccountMutations } from './useAccountMutations';
import { useCreateInstitution } from './useCreateInstitution';

/** Every account, institution and currency — see `useAllAccounts`'s reasoning for why one page is the whole set. */
function useAccountsData() {
  const accounts = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () => fetchAllPages(async (page) => unwrap(await accountsList({ query: page }))),
  });
  const institutions = useQuery({
    queryKey: ['finance', 'institutions', 'list'],
    queryFn: async () => unwrap(await institutionsList()),
  });
  const currencies = useQuery({
    queryKey: ['finance', 'currencies', 'list'],
    queryFn: async () => unwrap(await currenciesList()),
  });
  return { accounts, institutions, currencies };
}

function requiresGiftCardSecrets(values: AccountFormValues, isEditing: boolean): boolean {
  return (
    values.kind === 'gift-card' &&
    !isEditing &&
    (values.giftCardNumber === '' || values.giftCardPin === '')
  );
}

export function useAccountsPage() {
  const { accounts, institutions, currencies } = useAccountsData();
  const dialog = useAccountFormDialogState();
  const { createMutation, updateMutation } = useAccountMutations(dialog.closeDialog);
  const createInstitution = useCreateInstitution(dialog.form);

  const onSubmit = (values: AccountFormValues) => {
    if (requiresGiftCardSecrets(values, dialog.editingAccount !== null)) {
      if (values.giftCardNumber === '')
        dialog.form.setError('giftCardNumber', { message: 'Card number is required' });
      if (values.giftCardPin === '')
        dialog.form.setError('giftCardPin', { message: 'PIN is required' });
      return;
    }
    const mutation = dialog.editingAccount
      ? updateMutation.mutateAsync({ id: dialog.editingAccount.id, values })
      : createMutation.mutateAsync(values);
    mutation.catch((err: unknown) => {
      if (!mapAccountApiError(err, dialog.form)) {
        toast.error(err instanceof Error ? err.message : 'Failed to save account');
      }
    });
  };

  return {
    accounts,
    institutions,
    currencies,
    ...dialog,
    onSubmit,
    createInstitution,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
}

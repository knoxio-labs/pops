import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { unwrap } from '../../finance-api-helpers.js';
import { accountsList, currenciesList, institutionsList } from '../../finance-api/index.js';
import { fetchAllPages } from '../../lib/fetch-all-pages';
import { mapAccountApiError } from './account-error-mapping';
import {
  loanTermsFieldsDirty,
  loanTermsPartiallyFilled,
  type Account,
  type AccountFormValues,
} from './types';
import { useAccountFormDialogState } from './useAccountFormDialogState';
import { ACCOUNTS_KEY, toggleArchived, useAccountMutations } from './useAccountMutations';
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

/**
 * Gift-card secrets are never echoed back into the form (they're encrypted at
 * rest), so editing an account that was ALREADY `gift-card` always sees blank
 * fields — that blank must not be mistaken for "no secret on file". Secrets
 * are required on create, and on an edit that just switched an existing
 * non-gift-card account's kind to `gift-card` for the first time.
 */
export function requiresGiftCardSecrets(
  values: AccountFormValues,
  wasAlreadyGiftCard: boolean
): boolean {
  return (
    values.kind === 'gift-card' &&
    !wasAlreadyGiftCard &&
    (values.giftCardNumber === '' || values.giftCardPin === '')
  );
}

export function useAccountsPage() {
  const { accounts, institutions, currencies } = useAccountsData();
  const dialog = useAccountFormDialogState();
  const { createMutation, updateMutation, archiveMutation } = useAccountMutations(
    dialog.closeDialog
  );
  const createInstitution = useCreateInstitution(dialog.form);

  const onArchiveToggle = (account: Account) => {
    archiveMutation.mutate({ id: account.id, archivedAt: toggleArchived(account) });
  };

  const onSubmit = (values: AccountFormValues) => {
    if (requiresGiftCardSecrets(values, dialog.editingAccount?.kind === 'gift-card')) {
      if (values.giftCardNumber === '')
        dialog.form.setError('giftCardNumber', { message: 'Card number is required' });
      if (values.giftCardPin === '')
        dialog.form.setError('giftCardPin', { message: 'PIN is required' });
      return;
    }
    if (loanTermsPartiallyFilled(values)) {
      toast.error('Fill in every loan term, or clear them all');
      return;
    }
    const mutation = dialog.editingAccount
      ? updateMutation.mutateAsync({
          id: dialog.editingAccount.id,
          values,
          loanTermsDirty: loanTermsFieldsDirty(dialog.form.formState.dirtyFields),
        })
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
    onArchiveToggle,
    isArchiving: archiveMutation.isPending,
  };
}

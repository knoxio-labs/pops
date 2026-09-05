import { toast } from 'sonner';

import { mapAccountApiError } from './account-error-mapping';
import {
  loanTermsFieldsDirty,
  loanTermsPartiallyFilled,
  type Account,
  type AccountFormValues,
} from './types';
import { useAccountFormDialogState } from './useAccountFormDialogState';
import { toggleArchived, useAccountMutations } from './useAccountMutations';
import { useCreateInstitution } from './useCreateInstitution';

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

/**
 * The account form dialog's full lifecycle — open/close, create-vs-edit,
 * mutations and submit validation — shared between the accounts list (add
 * only) and the account detail page (edit only, opened straight into
 * `handleEdit`). Neither caller duplicates this; they differ only in when
 * they call `handleAdd` vs `handleEdit`.
 */
export function useAccountFormDialog() {
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
          dirtyFields: dialog.form.formState.dirtyFields,
        })
      : createMutation.mutateAsync(values);
    mutation.catch((err: unknown) => {
      if (!mapAccountApiError(err, dialog.form)) {
        toast.error(err instanceof Error ? err.message : 'Failed to save account');
      }
    });
  };

  return {
    ...dialog,
    onSubmit,
    createInstitution,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    onArchiveToggle,
    isArchiving: archiveMutation.isPending,
  };
}

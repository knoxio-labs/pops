import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../../finance-api-helpers.js';
import { currenciesList, institutionsList } from '../../../finance-api/index.js';
import { useAccountFormDialogState } from '../../../pages/accounts/useAccountFormDialogState';
import { useAccountMutations } from '../../../pages/accounts/useAccountMutations';
import { useCreateInstitution } from '../../../pages/accounts/useCreateInstitution';
import { useImportStore } from '../../../store/importStore';
import { useAllAccounts } from '../../accounts/hooks/useAllAccounts';

/**
 * Wires the import wizard's account picker to the real accounts endpoint and
 * the same create-account dialog the Accounts page uses (POPS-2840). Unlike
 * `useAccountsPage`, the dialog here is always in create mode — the import
 * wizard never edits an existing account — and a successful create pre-selects
 * the new account on the wizard's store rather than just closing the dialog.
 */
export function useAccountAndFormat() {
  const { accounts, isLoading: accountsLoading } = useAllAccounts();
  const institutionsQuery = useQuery({
    queryKey: ['finance', 'institutions', 'list'],
    queryFn: async () => unwrap(await institutionsList()),
  });
  const currenciesQuery = useQuery({
    queryKey: ['finance', 'currencies', 'list'],
    queryFn: async () => unwrap(await currenciesList()),
  });
  const { accountId, setAccount } = useImportStore();
  const dialog = useAccountFormDialogState();
  const { createMutation } = useAccountMutations(() => {
    // The mutation's own onSuccess (toast + would-be closeDialog) already ran;
    // the created account is only available on the resolved promise below, so
    // pre-selecting it and closing happen there instead of here.
  });

  const handleAdd = () => dialog.handleAdd();

  const handleCreate = (values: Parameters<typeof createMutation.mutateAsync>[0]) => {
    createMutation
      .mutateAsync(values)
      .then((created) => {
        setAccount(created.data.id, created.data.name);
        dialog.closeDialog();
      })
      .catch(() => {
        // Failure toasts are already surfaced by `useAccountMutations`; the
        // dialog stays open so the person can correct the form and retry.
      });
  };

  return {
    accounts: accounts ?? [],
    accountsLoading,
    accountId,
    setAccount,
    institutions: institutionsQuery.data?.data ?? [],
    currencies: currenciesQuery.data?.data ?? [],
    dialog,
    handleAdd,
    handleCreate,
    isCreating: createMutation.isPending,
    createInstitution: useCreateInstitution(dialog.form),
  };
}

export type AccountAndFormatState = ReturnType<typeof useAccountAndFormat>;

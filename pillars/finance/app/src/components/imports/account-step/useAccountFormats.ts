import { useMemo } from 'react';

import { useAllAccounts } from '../../accounts/hooks/useAllAccounts';
import { bankTypesForAccount } from './import-formats';

/**
 * The picked account and the bank dialects it can be read as (POPS-2854).
 * Shared between the account/format picker and the upload step itself, which
 * both need to know whether the currently picked account has anything to
 * import — the picker to render its radio list, the upload step to gate the
 * file drop and to steer `dialectId` away from a dialect the account cannot
 * use. Reads `useAllAccounts` rather than the raw accounts endpoint because
 * the institution name — the only thing a dialect can be matched against — is
 * already resolved there.
 */
export function useAccountFormats(accountId: string | null) {
  const { accounts, isLoading: accountsLoading } = useAllAccounts();
  const account = (accounts ?? []).find((candidate) => candidate.id === accountId);

  const availableBanks = useMemo(() => (account ? bankTypesForAccount(account) : []), [account]);

  return {
    accounts: accounts ?? [],
    accountsLoading,
    account,
    availableBanks,
  };
}

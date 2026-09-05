import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../finance-api-helpers.js';
import { checkpointsList } from '../../finance-api/index.js';
import { useAccountsData } from '../accounts/useAccountsPage';
import { accountCheckpointsKey } from './queryKeys';

import type { CurrenciesListResponses } from '../../finance-api/index.js';
import type { Account, Institution } from '../accounts/types';

type Currency = CurrenciesListResponses[200]['data'][number];

function findAccount(accounts: Account[], accountId: string): Account | null {
  return accounts.find((candidate) => candidate.id === accountId) ?? null;
}

function findCurrency(currencies: Currency[], code: string | undefined): Currency | null {
  return currencies.find((candidate) => candidate.code === code) ?? null;
}

/**
 * The checkpoints page's data: the account out of the same full-list query
 * `useAccountDetailPage` shares (`useAccountsData`), plus this account's own
 * checkpoint history. An id that never resolves reads as `account: null`
 * once the accounts query has settled — same miss handling as the account
 * dashboard. The checkpoints query only runs once the account is found, so a
 * bad id never fires a doomed request against `/accounts/:id/checkpoints`.
 */
export function useAccountCheckpointsPage(accountId: string) {
  const { accounts, institutions, currencies } = useAccountsData();
  const accountRows = accounts.data?.data ?? [];
  const institutionRows: Institution[] = institutions.data?.data ?? [];
  const currencyRows = currencies.data?.data ?? [];
  const account = findAccount(accountRows, accountId);

  const checkpoints = useQuery({
    queryKey: accountCheckpointsKey(accountId),
    queryFn: async () => unwrap(await checkpointsList({ path: { id: accountId } })),
    enabled: account !== null,
  });

  return {
    accounts,
    isLoading: accounts.isLoading || institutions.isLoading || currencies.isLoading,
    account,
    institutions: institutionRows,
    currency: findCurrency(currencyRows, account?.currency),
    checkpoints,
  };
}

import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../finance-api-helpers.js';
import { accountsList, currenciesList } from '../../finance-api/index.js';
import { fetchAllPages } from '../../lib/fetch-all-pages';
import { useAccountFormDialog } from './useAccountFormDialog';
import { ACCOUNTS_KEY } from './useAccountMutations';

/**
 * Every account and currency — see `useAllAccounts`'s reasoning for why one
 * page is the whole set. Exported for `useAccountDetailPage`, which finds
 * one account in this same set rather than fetching it again by id — there
 * is no per-account endpoint worth adding a second cache key for at
 * household scale.
 *
 * No `institutions` query here (POPS-3063 dropped it): every account
 * response already carries its resolved issuer (`entityDisplayName`/
 * `institution`), so nothing in this pillar joins against a separately
 * fetched institutions list anymore. The account form's own issuer picker
 * reads `bank`-typed contacts Entities instead — see
 * `useAccountFormDialog`'s `bankEntities`.
 */
export function useAccountsData() {
  const accounts = useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () => fetchAllPages(async (page) => unwrap(await accountsList({ query: page }))),
  });
  const currencies = useQuery({
    queryKey: ['finance', 'currencies', 'list'],
    queryFn: async () => unwrap(await currenciesList()),
  });
  return { accounts, currencies };
}

export function useAccountsPage() {
  const { accounts, currencies } = useAccountsData();
  const formDialog = useAccountFormDialog();

  return {
    accounts,
    currencies,
    ...formDialog,
  };
}

import { useQuery } from '@tanstack/react-query';

import { unwrap } from '../../finance-api-helpers.js';
import { accountsList, currenciesList, institutionsList } from '../../finance-api/index.js';
import { fetchAllPages } from '../../lib/fetch-all-pages';
import { useAccountFormDialog } from './useAccountFormDialog';
import { ACCOUNTS_KEY } from './useAccountMutations';

/**
 * Every account, institution and currency — see `useAllAccounts`'s reasoning
 * for why one page is the whole set. Exported for `useAccountDetailPage`,
 * which finds one account in this same set rather than fetching it again by
 * id — there is no per-account endpoint worth adding a second cache key for
 * at household scale.
 */
export function useAccountsData() {
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

export function useAccountsPage() {
  const { accounts, institutions, currencies } = useAccountsData();
  const formDialog = useAccountFormDialog();

  return {
    accounts,
    institutions,
    currencies,
    ...formDialog,
  };
}

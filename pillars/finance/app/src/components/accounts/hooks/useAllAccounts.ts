import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import { accountsList, institutionsList } from '../../../finance-api/index.js';
import { toAccountOptions } from '../toAccountOptions';

import type { AccountOption } from '@pops/ui';

/** `LimitQuery`'s max (`rest-schemas.ts`) — the largest single page the API allows. */
const ACCOUNTS_LIST_LIMIT = 500;

/**
 * Every account, joined with its institution, for a picker that has no
 * pagination of its own. `accounts.list` caps a page at 500; a household's
 * account count sits far below that, so one page over the max is the whole
 * set — unlike `useEntities`, this is not routed around a capped default via
 * a bulk endpoint, because none exists for accounts.
 *
 * `accounts` is `undefined` until both queries resolve, so callers may read
 * "not in `accounts`" as "does not exist" only once it is defined.
 */
export function useAllAccounts() {
  const accountsQuery = useQuery({
    queryKey: ['finance', 'accounts', 'list'],
    queryFn: async () => unwrap(await accountsList({ query: { limit: ACCOUNTS_LIST_LIMIT } })),
  });
  const institutionsQuery = useQuery({
    queryKey: ['finance', 'institutions', 'list'],
    queryFn: async () => unwrap(await institutionsList()),
  });

  const accounts = useMemo<AccountOption[] | undefined>(() => {
    const accountRows = accountsQuery.data?.data;
    const institutionRows = institutionsQuery.data?.data;
    if (!accountRows || !institutionRows) return undefined;
    return toAccountOptions(accountRows, institutionRows);
  }, [accountsQuery.data, institutionsQuery.data]);

  return {
    accounts,
    isLoading: accountsQuery.isLoading || institutionsQuery.isLoading,
    error: accountsQuery.error ?? institutionsQuery.error,
  };
}

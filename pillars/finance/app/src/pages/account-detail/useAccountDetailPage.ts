import { useAccountFormDialog } from '../accounts/useAccountFormDialog';
import { useAccountsData } from '../accounts/useAccountsPage';

import type { CurrenciesListResponses } from '../../finance-api/index.js';
import type { Account, Institution } from '../accounts/types';

type Currency = CurrenciesListResponses[200]['data'][number];

function findAccount(accounts: Account[], accountId: string): Account | null {
  return accounts.find((candidate) => candidate.id === accountId) ?? null;
}

function findInstitution(
  institutions: Institution[],
  institutionId: string | null | undefined
): Institution | null {
  return institutions.find((candidate) => candidate.id === institutionId) ?? null;
}

function findCurrency(currencies: Currency[], code: string | undefined): Currency | null {
  return currencies.find((candidate) => candidate.code === code) ?? null;
}

/**
 * The account dashboard's data: one account out of the same full-list query
 * `useAccountsPage` already uses (`useAccountsData`), rather than a separate
 * per-id fetch — an id that never resolves (renamed, deleted, mistyped in a
 * URL) is expressed as `account: null` once the query has settled, same as
 * `resolveAccountOption` elsewhere in this app treats a miss.
 *
 * The edit dialog is `useAccountFormDialog` — the same hook the accounts
 * list drives its "Add account" dialog with — opened straight into
 * `handleEdit(account)` from the header's "Edit account" button rather than
 * `handleAdd`.
 */
export function useAccountDetailPage(accountId: string) {
  const { accounts, institutions, currencies } = useAccountsData();
  const formDialog = useAccountFormDialog();

  const accountRows = accounts.data?.data ?? [];
  const institutionRows = institutions.data?.data ?? [];
  const currencyRows = currencies.data?.data ?? [];
  const account = findAccount(accountRows, accountId);

  return {
    accounts,
    institutions: institutionRows,
    currencies: currencyRows,
    isLoading: accounts.isLoading || institutions.isLoading || currencies.isLoading,
    account,
    institution: findInstitution(institutionRows, account?.institutionId),
    currency: findCurrency(currencyRows, account?.currency),
    ...formDialog,
  };
}

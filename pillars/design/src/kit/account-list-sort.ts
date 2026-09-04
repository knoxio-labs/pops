import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';

import type { AccountKind } from '@/fixtures/account-kinds';
import type { Account } from '@/fixtures/accounts';

/**
 * How the accounts list can be ordered. `kind-balance` is the default: kind
 * in vocabulary order, largest balance first within each kind. `recent`
 * approximates recency with transaction count, the only activity signal the
 * fixtures carry — there is no last-transaction date to sort by, which is
 * why it is labelled by what it actually measures.
 */
export type AccountSort = 'kind-balance' | 'balance' | 'name' | 'recent';

export const ACCOUNT_SORT_OPTIONS: { value: AccountSort; label: string }[] = [
  { value: 'kind-balance', label: 'Kind, then balance' },
  { value: 'balance', label: 'Balance' },
  { value: 'name', label: 'Name' },
  { value: 'recent', label: 'Most transactions' },
];

const KIND_ORDER = Object.keys(ACCOUNT_KINDS) as AccountKind[];

function kindThenBalance(a: Account, b: Account): number {
  const kindDiff = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  return kindDiff !== 0 ? kindDiff : b.balance - a.balance;
}

const COMPARATORS: Record<AccountSort, (a: Account, b: Account) => number> = {
  'kind-balance': kindThenBalance,
  balance: (a, b) => b.balance - a.balance,
  name: (a, b) => a.name.localeCompare(b.name),
  recent: (a, b) => b.transactionCount - a.transactionCount,
};

/** Narrows a raw ComboboxSelect value to a known sort, for the string the widget hands back. */
export function isAccountSort(value: string): value is AccountSort {
  return value in COMPARATORS;
}

/** Accounts sorted per the chosen order. */
export function sortAccounts(accounts: Account[], sort: AccountSort): Account[] {
  return accounts.toSorted(COMPARATORS[sort]);
}

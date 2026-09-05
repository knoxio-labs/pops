import { ACCOUNT_KINDS } from '@pops/finance';

import type { Account } from './types';

/**
 * How the accounts list can be ordered.
 *
 * Mirrors the design's `account-list-sort.ts` (`pillars/design/src/kit`)
 * except for its `kind-balance` default and its `recent` — that default ties
 * kind order to balance, which this leaves as a separate `balance` option
 * rather than folding in, and `recent` here uses the account's real
 * `updatedAt` rather than the design's transaction-count proxy, which has no
 * backing field on this wire schema.
 */
export type AccountSort = 'kind' | 'balance' | 'name' | 'recent';

export const ACCOUNT_SORT_OPTIONS: { value: AccountSort; label: string }[] = [
  { value: 'kind', label: 'Kind, then name' },
  { value: 'balance', label: 'Balance' },
  { value: 'name', label: 'Name' },
  { value: 'recent', label: 'Recently updated' },
];

const KIND_ORDER = ACCOUNT_KINDS as readonly string[];

function kindThenName(a: Account, b: Account): number {
  const kindDiff = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
  return kindDiff !== 0 ? kindDiff : a.name.localeCompare(b.name);
}

const COMPARATORS: Record<AccountSort, (a: Account, b: Account) => number> = {
  kind: kindThenName,
  balance: (a, b) => b.balance.balanceCents - a.balance.balanceCents,
  name: (a, b) => a.name.localeCompare(b.name),
  recent: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
};

/** Narrows a raw ComboboxSelect value to a known sort, for the string the widget hands back. */
export function isAccountSort(value: string): value is AccountSort {
  return value in COMPARATORS;
}

/** Accounts sorted per the chosen order. */
export function sortAccounts(accounts: Account[], sort: AccountSort): Account[] {
  return accounts.toSorted(COMPARATORS[sort]);
}

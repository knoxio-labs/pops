import { ACCOUNT_KINDS } from '@pops/finance';

import type { Account } from './types';

/**
 * How the accounts list can be ordered.
 *
 * The design's `account-list-sort.ts` (`pillars/design/src/kit`) specifies a
 * fourth `balance` option and defaults to `kind-balance` (kind, then largest
 * balance first). Neither is implementable against the real API today: the
 * `accounts` wire schema carries no balance field (POPS-2750, account
 * balances, has not landed — the same reason `AccountOption` in `@pops/ui`
 * carries no balance). `kind` here ties within a kind by name rather than
 * balance, and `recent` uses the account's real `updatedAt` rather than the
 * design's transaction-count proxy (which also has no backing data on this
 * schema) — both real fields, not fabricated ones.
 */
export type AccountSort = 'kind' | 'name' | 'recent';

export const ACCOUNT_SORT_OPTIONS: { value: AccountSort; label: string }[] = [
  { value: 'kind', label: 'Kind, then name' },
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

import { ACCOUNT_KINDS } from '@pops/finance';

import type { Currency } from './account-subtotals';
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

/**
 * Cents only compare within one currency: AUD against EUR needs a rate that
 * does not exist here, and points are not money at all — the same refusal
 * `account-subtotals.ts` makes when it declines to blend a total. So points
 * sink below every money account whatever their code sorts as, currencies
 * group among themselves, and the balance orders only inside a group.
 *
 * A code absent from `currencies` counts as money, matching
 * `currencyFormat`'s fiat fallback — an unknown code is far likelier to be a
 * currency this render has yet to see than a points scheme.
 */
function byBalanceWithinCurrency(currencies: Currency[]): (a: Account, b: Account) => number {
  const kindByCode = new Map(currencies.map((c) => [c.code, c.kind]));
  const isPoints = (account: Account): boolean => {
    const kind = kindByCode.get(account.currency);
    return kind === 'points';
  };
  return (a, b) => {
    if (isPoints(a) !== isPoints(b)) return isPoints(a) ? 1 : -1;
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return b.balance.balanceCents - a.balance.balanceCents;
  };
}

function comparators(
  currencies: Currency[]
): Record<AccountSort, (a: Account, b: Account) => number> {
  return {
    kind: kindThenName,
    balance: byBalanceWithinCurrency(currencies),
    name: (a, b) => a.name.localeCompare(b.name),
    recent: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  };
}

/** Narrows a raw ComboboxSelect value to a known sort, for the string the widget hands back. */
export function isAccountSort(value: string): value is AccountSort {
  return ACCOUNT_SORT_OPTIONS.some((option) => option.value === value);
}

/** Accounts sorted per the chosen order; `currencies` is what tells the balance sort what is money. */
export function sortAccounts(
  accounts: Account[],
  sort: AccountSort,
  currencies: Currency[]
): Account[] {
  return accounts.toSorted(comparators(currencies)[sort]);
}

import { useState } from 'react';

import { ACCOUNT_KINDS, type AccountKind } from '@pops/finance';

import { sortAccounts, type AccountSort } from './account-list-sort';

import type { Currency } from './account-subtotals';
import type { Account } from './types';

/** The issuer name to search against, whichever side resolved it (POPS-3063) — see `Account.institution`. */
function issuerName(account: Account): string {
  return account.entityDisplayName ?? account.institution?.name ?? '';
}

function searchText(account: Account): string {
  return `${account.name} ${issuerName(account)}`.toLowerCase();
}

function matches(account: Account, query: string, kinds: AccountKind[]): boolean {
  if (kinds.length > 0 && !kinds.includes(account.kind)) return false;
  const needle = query.trim().toLowerCase();
  return needle === '' || searchText(account).includes(needle);
}

function describe(total: number, shown: number, archived: number, narrowed: boolean): string {
  if (total === 0) return 'Every transaction belongs to an account.';
  if (narrowed) return `${shown} of ${total} accounts`;
  return `${total - archived} active · ${archived} archived`;
}

/**
 * Client-side search, kind filter, archived reveal and sort over the full
 * accounts list — ported from the design's `account-list-controls.tsx`
 * (`useAccountListFilters`), which this mirrors field-for-field except for
 * `AccountSort`'s reduced, real-data-only options (see `account-list-sort.ts`).
 * Client-side rather than server round trips per keystroke because a
 * household's account count sits far below the API's page cap — the same
 * reasoning `useAllAccounts` documents for the picker's "fetch everything".
 */
export function useAccountListFilters(accounts: Account[], currencies: Currency[]) {
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<AccountKind[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<AccountSort>('kind');

  const narrowed = query.trim() !== '' || kinds.length > 0;
  const visible = sortAccounts(
    accounts.filter((a) => (showArchived || a.archivedAt === null) && matches(a, query, kinds)),
    sort,
    currencies
  );
  const archivedCount = accounts.filter((a) => a.archivedAt !== null).length;

  return {
    query,
    setQuery,
    kinds,
    toggleKind: (kind: AccountKind) =>
      setKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind])),
    showArchived,
    toggleArchived: () => setShowArchived((prev) => !prev),
    sort,
    setSort,
    clear: () => {
      setQuery('');
      setKinds([]);
    },
    presentKinds: ACCOUNT_KINDS.filter((kind) => accounts.some((a) => a.kind === kind)),
    visible,
    archivedCount,
    narrowed,
    description: describe(accounts.length, visible.length, archivedCount, narrowed),
  };
}

export type AccountListFilters = ReturnType<typeof useAccountListFilters>;

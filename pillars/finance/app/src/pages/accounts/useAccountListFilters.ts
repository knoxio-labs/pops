import { useState } from 'react';

import { ACCOUNT_KINDS, type AccountKind } from '@pops/finance';

import { sortAccounts, type AccountSort } from './account-list-sort';

import type { Account, Institution } from './types';

function searchText(account: Account, institutionsById: Map<string, Institution>): string {
  const institution = account.institutionId
    ? institutionsById.get(account.institutionId)?.name
    : undefined;
  return `${account.name} ${institution ?? ''} ${account.entityDisplayName ?? ''}`.toLowerCase();
}

function matches(
  account: Account,
  query: string,
  kinds: AccountKind[],
  institutionsById: Map<string, Institution>
): boolean {
  if (kinds.length > 0 && !kinds.includes(account.kind)) return false;
  const needle = query.trim().toLowerCase();
  return needle === '' || searchText(account, institutionsById).includes(needle);
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
export function useAccountListFilters(accounts: Account[], institutions: Institution[]) {
  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<AccountKind[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<AccountSort>('kind');
  const institutionsById = new Map(institutions.map((i) => [i.id, i]));

  const narrowed = query.trim() !== '' || kinds.length > 0;
  const visible = sortAccounts(
    accounts.filter(
      (a) => (showArchived || a.archivedAt === null) && matches(a, query, kinds, institutionsById)
    ),
    sort
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

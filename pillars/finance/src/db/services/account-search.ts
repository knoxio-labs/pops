import { ACCOUNT_KINDS } from '../../contract/account-kind.js';

import type { AccountKind } from '../../contract/account-kind.js';

const ACCOUNT_KIND_SEARCH_LABELS = {
  checking: 'Checking',
  savings: 'Savings',
  'credit-card': 'Credit card',
  cash: 'Cash',
  'gift-card': 'Gift card',
  person: 'Person',
  shared: 'Shared',
  loan: 'Loan',
  'novated-lease': 'Novated lease',
  crypto: 'Crypto',
  other: 'Other',
} satisfies Record<AccountKind, string>;

/** Return account kinds whose key or display label contains the search text. */
export function accountKindsMatchingSearch(search: string): AccountKind[] {
  const needle = search.toLocaleLowerCase();
  return ACCOUNT_KINDS.filter((kind) =>
    `${kind} ${ACCOUNT_KIND_SEARCH_LABELS[kind]}`.toLocaleLowerCase().includes(needle)
  );
}

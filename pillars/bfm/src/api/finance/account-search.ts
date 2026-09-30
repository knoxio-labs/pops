import type { MobileAccount } from '../../contract/account.js';

const ACCOUNT_KIND_LABELS: Readonly<Record<string, string>> = {
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
};

function kindLabel(kind: string): string {
  const known = ACCOUNT_KIND_LABELS[kind];
  if (known !== undefined) return known;
  return kind
    .split('-')
    .map((word) => `${word.slice(0, 1).toLocaleUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/** Match the account list's current case-insensitive search fields. */
export function matchesMobileAccountSearch(account: MobileAccount, search: string): boolean {
  const needle = search.toLocaleLowerCase();
  return [account.name, account.institutionName, account.contact, kindLabel(account.kind)]
    .filter((value): value is string => value !== null)
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

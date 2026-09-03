import type { AccountKind } from './account-kinds';

/**
 * Fictional accounts for the finance account screens. Two of these mirror the
 * live data (`Amex`, `ANZ Credit Card`); the rest exist so every kind, an
 * archived row and a second currency all have somewhere to be seen.
 */
export interface Account {
  id: string;
  name: string;
  institution?: string;
  kind: AccountKind;
  /** ISO 4217. Exactly one per account. */
  currency: string;
  /** ISO date from which the transaction history is believed complete. */
  historyCompleteFrom?: string;
  archived: boolean;
  /** Position within the list; lower sorts first. */
  order: number;
  /** Gift cards and person ledgers name a contacts entity. */
  contact?: string;
  /** Gift cards only. */
  expires?: string;
  /** Rows imported against this account, shown so an archive reads as safe. */
  transactionCount: number;
}

export const accounts: Account[] = [
  {
    id: 'a1',
    name: 'Everyday',
    institution: 'ANZ',
    kind: 'checking',
    currency: 'AUD',
    historyCompleteFrom: '2024-07-01',
    archived: false,
    order: 1,
    transactionCount: 1_842,
  },
  {
    id: 'a2',
    name: 'Amex',
    institution: 'American Express',
    kind: 'credit-card',
    currency: 'AUD',
    historyCompleteFrom: '2025-01-01',
    archived: false,
    order: 2,
    transactionCount: 499,
  },
  {
    id: 'a3',
    name: 'ANZ Credit Card',
    institution: 'ANZ',
    kind: 'credit-card',
    currency: 'AUD',
    historyCompleteFrom: '2025-03-14',
    archived: false,
    order: 3,
    transactionCount: 101,
  },
  {
    id: 'a4',
    name: 'Offset',
    institution: 'ANZ',
    kind: 'savings',
    currency: 'AUD',
    archived: false,
    order: 4,
    transactionCount: 63,
  },
  {
    id: 'a5',
    name: 'Wallet',
    kind: 'cash',
    currency: 'AUD',
    archived: false,
    order: 5,
    transactionCount: 27,
  },
  {
    id: 'a6',
    name: 'PayLab credit',
    kind: 'gift-card',
    currency: 'AUD',
    contact: 'PayLab',
    expires: '2027-02-28',
    archived: false,
    order: 6,
    transactionCount: 16,
  },
  {
    id: 'a7',
    name: 'Marta',
    kind: 'person',
    currency: 'AUD',
    contact: 'Marta Ferreira',
    archived: false,
    order: 7,
    transactionCount: 9,
  },
  {
    id: 'a8',
    name: 'Euro cash',
    kind: 'cash',
    currency: 'EUR',
    archived: false,
    order: 8,
    transactionCount: 4,
  },
  {
    id: 'a9',
    name: 'Old ING Orange',
    institution: 'ING',
    kind: 'checking',
    currency: 'AUD',
    historyCompleteFrom: '2021-06-01',
    archived: true,
    order: 9,
    transactionCount: 730,
  },
];

/** The list as a screen shows it by default: active only, in display order. */
export const activeAccounts = accounts
  .filter((a) => !a.archived)
  .toSorted((a, b) => a.order - b.order);

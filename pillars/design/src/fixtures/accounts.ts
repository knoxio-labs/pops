import type { AccountKind } from './account-kinds';

/**
 * Fictional accounts for the finance account screens. Two of these mirror the
 * live data (`Amex`, `ANZ Credit Card`); the rest exist so every kind, an
 * archived account, a second currency and a points balance all have somewhere
 * to be seen.
 *
 * Balances are shown even though POPS-2750 owns checkpoints: a design that
 * leaves the number out cannot be judged on the thing the screen is for.
 */
export interface Account {
  id: string;
  name: string;
  /** An `institutions` id. Cash and person ledgers have none. */
  institutionId?: string;
  kind: AccountKind;
  /** A `currencies` code. Exactly one per account, points included. */
  currency: string;
  archived: boolean;
  /** Position within the list; lower sorts first. */
  order: number;
  /**
   * Minor units, signed in the account's own terms: a credit card's positive
   * balance is money owed, a person ledger's positive balance is owed to you.
   */
  balance: number;
  /** When the balance was last confirmed against an external source. */
  balanceAsOf?: string;
  /** Gift cards and person ledgers name a contacts entity. */
  contact?: string;
  /** Gift cards only. */
  expires?: string;
  transactionCount: number;
}

export const accounts: Account[] = [
  {
    id: 'a1',
    name: 'Everyday',
    institutionId: 'anz',
    kind: 'checking',
    currency: 'AUD',
    archived: false,
    order: 1,
    balance: 428_140,
    balanceAsOf: '2026-09-01',
    transactionCount: 1_842,
  },
  {
    id: 'a2',
    name: 'Amex',
    institutionId: 'amex',
    kind: 'credit-card',
    currency: 'AUD',
    archived: false,
    order: 2,
    balance: -213_755,
    balanceAsOf: '2026-09-02',
    transactionCount: 499,
  },
  {
    id: 'a3',
    name: 'ANZ Credit Card',
    institutionId: 'anz',
    kind: 'credit-card',
    currency: 'AUD',
    archived: false,
    order: 3,
    balance: -48_920,
    balanceAsOf: '2026-08-30',
    transactionCount: 101,
  },
  {
    id: 'a4',
    name: 'Offset',
    institutionId: 'anz',
    kind: 'savings',
    currency: 'AUD',
    archived: false,
    order: 4,
    balance: 3_120_000,
    balanceAsOf: '2026-09-01',
    transactionCount: 63,
  },
  {
    id: 'a5',
    name: 'Wallet',
    kind: 'cash',
    currency: 'AUD',
    archived: false,
    order: 5,
    balance: 8_500,
    transactionCount: 27,
  },
  {
    id: 'a6',
    name: 'PayLab credit',
    institutionId: 'paylab',
    kind: 'gift-card',
    currency: 'AUD',
    contact: 'PayLab',
    expires: '2027-02-28',
    archived: false,
    order: 6,
    balance: 14_250,
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
    balance: -6_400,
    transactionCount: 9,
  },
  {
    id: 'a8',
    name: 'Euro cash',
    kind: 'cash',
    currency: 'EUR',
    archived: false,
    order: 8,
    balance: 21_000,
    transactionCount: 4,
  },
  {
    id: 'a9',
    name: 'Membership Rewards',
    institutionId: 'amex',
    kind: 'other',
    currency: 'MR',
    archived: false,
    order: 9,
    balance: 184_320,
    balanceAsOf: '2026-09-02',
    transactionCount: 22,
  },
  {
    id: 'a11',
    name: 'Home loan',
    institutionId: 'anz',
    kind: 'loan',
    currency: 'AUD',
    archived: false,
    order: 10,
    balance: -38_690_000,
    balanceAsOf: '2026-09-01',
    transactionCount: 58,
  },
  {
    id: 'a10',
    name: 'Old ING Orange',
    institutionId: 'ing',
    kind: 'checking',
    currency: 'AUD',
    archived: true,
    order: 11,
    balance: 0,
    transactionCount: 730,
  },
  {
    id: 'a12',
    name: 'Car loan',
    institutionId: 'anz',
    kind: 'loan',
    currency: 'AUD',
    archived: false,
    order: 12,
    balance: -1_820_000,
    balanceAsOf: '2026-09-01',
    transactionCount: 14,
  },
  {
    id: 'a13',
    name: 'Up Spending',
    institutionId: 'up',
    kind: 'checking',
    currency: 'AUD',
    archived: false,
    order: 13,
    balance: 61_215,
    balanceAsOf: '2026-09-06',
    transactionCount: 312,
  },
];

/** The list as a screen shows it by default: active only, in display order. */
export const activeAccounts = accounts
  .filter((a) => !a.archived)
  .toSorted((a, b) => a.order - b.order);

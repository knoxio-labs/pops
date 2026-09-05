/**
 * Fictional transactions for the iOS transaction screens, shaped like
 * `AppCore/Transactions` rather than like the import wizard's rows: minor
 * units signed exactly as a server would send them, an open `type` string,
 * and a detail record that carries the fields only a fetch can supply.
 *
 * The two shapes are separate on purpose. A list row is what a tap already
 * has in hand, and the detail is what arrives afterwards — designing them as
 * one object would hide the seeded state the phone actually opens in.
 */
export interface Transaction {
  id: string;
  description: string;
  /** Minor units, signed as sent: negative is money leaving. */
  amountMinorUnits: number;
  currency: string;
  date: string;
  /**
   * An open vocabulary, not a union: the app shows a value it does not know
   * verbatim rather than hiding the row, so a server that grows a ninth type
   * does not need an app release.
   */
  type: string;
  entityName?: string;
  tags: string[];
}

export interface TransactionDetail extends Transaction {
  account: string;
  location?: string;
  country?: string;
  notes?: string;
  lastEditedAt?: string;
}

/** The eight the server sends today. A value outside this list still renders. */
export const KNOWN_TRANSACTION_TYPES = [
  'purchase',
  'transfer',
  'income',
  'refund',
  'reversal',
  'loan',
  'rebate',
  'tax',
] as const;

const coffee: Transaction = {
  id: 't1',
  description: 'Flat white',
  amountMinorUnits: -540,
  currency: 'AUD',
  date: '2026-09-03',
  type: 'purchase',
  entityName: 'Sample Coffee',
  tags: ['coffee'],
};

export const transactions: Transaction[] = [
  coffee,
  {
    id: 't2',
    description: 'Woolworths Metro Surry Hills',
    amountMinorUnits: -8_412,
    currency: 'AUD',
    date: '2026-09-03',
    type: 'purchase',
    entityName: 'Woolworths',
    tags: ['groceries'],
  },
  {
    id: 't3',
    description: 'Rent',
    amountMinorUnits: -124_000,
    currency: 'AUD',
    date: '2026-09-01',
    type: 'transfer',
    entityName: 'Landlord',
    tags: ['housing', 'recurring'],
  },
  {
    id: 't4',
    description: 'Salary',
    amountMinorUnits: 420_000,
    currency: 'AUD',
    date: '2026-08-29',
    type: 'income',
    entityName: 'Employer',
    tags: [],
  },
  {
    id: 't5',
    description: 'Opal top up',
    amountMinorUnits: -4_000,
    currency: 'AUD',
    date: '2026-08-28',
    type: 'purchase',
    tags: ['transport', 'recurring'],
  },
  {
    id: 't6',
    description: 'Kmart Broadway',
    amountMinorUnits: -8_423,
    currency: 'AUD',
    date: '2026-08-27',
    type: 'purchase',
    entityName: 'Kmart',
    tags: ['home'],
  },
  {
    id: 't7',
    description: 'Kmart Broadway',
    amountMinorUnits: 2_100,
    currency: 'AUD',
    date: '2026-08-26',
    type: 'refund',
    entityName: 'Kmart',
    tags: ['home'],
  },
  {
    id: 't8',
    description: 'Qantas flight ATH',
    amountMinorUnits: -138_900,
    currency: 'AUD',
    date: '2026-08-24',
    type: 'purchase',
    entityName: 'Qantas',
    tags: ['travel'],
  },
  {
    id: 't9',
    description: 'Offset transfer',
    amountMinorUnits: -200_000,
    currency: 'AUD',
    date: '2026-08-22',
    type: 'transfer',
    tags: [],
  },
  {
    id: 't10',
    description: 'Council rates',
    amountMinorUnits: -46_150,
    currency: 'AUD',
    date: '2026-08-20',
    type: 'tax',
    entityName: 'City of Sydney',
    tags: ['housing'],
  },
  {
    id: 't11',
    description: 'Deposit reconciliation',
    amountMinorUnits: 1_250,
    currency: 'AUD',
    date: '2026-08-19',
    type: 'settlement',
    tags: [],
  },
];

export const transactionsById = new Map(transactions.map((t) => [t.id, t]));

/** The fuller record for `t1`, as a fetch returns it after the tap. */
export const transactionDetail: TransactionDetail = {
  ...coffee,
  account: 'Everyday',
  location: 'Surry Hills',
  country: 'Australia',
  notes: 'Before the standup.',
  lastEditedAt: '2026-09-03T09:14:00',
};

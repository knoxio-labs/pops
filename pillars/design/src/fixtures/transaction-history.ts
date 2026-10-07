import { GUEST_EMAIL, OPERATOR_EMAIL } from './sharing';

/**
 * Fictional audit events for one transaction and for a whole account: create,
 * update, delete and restore, each with who did it and when. An update carries
 * only the fields that changed, already formatted, since the history view
 * shows before and after and nothing else.
 */
export type HistoryAction = 'create' | 'update' | 'delete' | 'restore';

export const ACTION_VERB: Record<HistoryAction, string> = {
  create: 'added',
  update: 'edited',
  delete: 'deleted',
  restore: 'restored',
};

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface HistoryEvent {
  id: string;
  /** The entry the event is about, by its description at the time. */
  description: string;
  action: HistoryAction;
  /** Absent when the system did it, as when a bank import matches a repayment. */
  byEmail?: string;
  at: string;
  /** The entry's amount after the event, minor units in the account's terms. */
  amount: number;
  changes: FieldChange[];
  /** A deleted entry that nothing has restored yet. */
  restorable?: boolean;
}

const created: HistoryEvent = {
  id: 'h1',
  description: 'Dinner at Sample Trattoria',
  action: 'create',
  byEmail: OPERATOR_EMAIL,
  at: '2026-09-28T21:14:00',
  amount: 8_200,
  changes: [],
};

const amountFixed: HistoryEvent = {
  id: 'h2',
  description: 'Dinner at Sample Trattoria',
  action: 'update',
  byEmail: GUEST_EMAIL,
  at: '2026-09-29T08:02:00',
  amount: 8_600,
  changes: [
    { field: 'Amount', before: '$82.00', after: '$86.00' },
    { field: 'Files', before: '1 file', after: '2 files' },
  ],
};

const moved: HistoryEvent = {
  id: 'h3',
  description: 'Dinner at Sample Trattoria',
  action: 'update',
  byEmail: OPERATOR_EMAIL,
  at: '2026-09-30T19:40:00',
  amount: 8_600,
  changes: [
    { field: 'Account', before: 'Wallet', after: 'Marta' },
    { field: 'Date', before: '27 Sep 2026', after: '28 Sep 2026' },
  ],
};

const deleted: HistoryEvent = {
  id: 'h4',
  description: 'Dinner at Sample Trattoria',
  action: 'delete',
  byEmail: GUEST_EMAIL,
  at: '2026-10-02T10:26:00',
  amount: 8_600,
  changes: [],
  restorable: true,
};

const restored: HistoryEvent = {
  id: 'h5',
  description: 'Dinner at Sample Trattoria',
  action: 'restore',
  byEmail: OPERATOR_EMAIL,
  at: '2026-10-02T18:05:00',
  amount: 8_600,
  changes: [],
};

/** Newest first, as every history list reads. */
export const entryHistory: HistoryEvent[] = [moved, amountFixed, created];
export const deletedEntryHistory: HistoryEvent[] = [deleted, ...entryHistory];
export const restoredEntryHistory: HistoryEvent[] = [
  restored,
  { ...deleted, restorable: false },
  ...entryHistory,
];

export const accountActivity: HistoryEvent[] = [
  {
    id: 'a1',
    description: 'Parking at the venue',
    action: 'delete',
    byEmail: GUEST_EMAIL,
    at: '2026-10-02T10:31:00',
    amount: -1_800,
    changes: [],
    restorable: true,
  },
  moved,
  amountFixed,
  created,
  {
    id: 'a2',
    description: 'Groceries for the house',
    action: 'create',
    byEmail: GUEST_EMAIL,
    at: '2026-09-24T17:48:00',
    amount: -4_250,
    changes: [],
  },
  {
    id: 'a3',
    description: 'Concert tickets',
    action: 'restore',
    byEmail: OPERATOR_EMAIL,
    at: '2026-09-21T09:10:00',
    amount: 12_000,
    changes: [],
  },
  {
    id: 'a4',
    description: 'Concert tickets',
    action: 'delete',
    byEmail: OPERATOR_EMAIL,
    at: '2026-09-21T09:07:00',
    amount: 12_000,
    changes: [],
  },
  {
    id: 'a5',
    description: 'Repayment',
    action: 'update',
    at: '2026-09-16T04:00:00',
    amount: -10_000,
    changes: [{ field: 'Bank match', before: 'Not matched', after: 'Matched to Everyday, 15 Sep' }],
  },
  {
    id: 'a6',
    description: 'Repayment',
    action: 'create',
    byEmail: GUEST_EMAIL,
    at: '2026-09-15T12:20:00',
    amount: -10_000,
    changes: [],
  },
  {
    id: 'a7',
    description: 'Pharmacy',
    action: 'create',
    byEmail: OPERATOR_EMAIL,
    at: '2026-09-09T13:02:00',
    amount: 3_290,
    changes: [],
  },
];

const LEDGER_AS_OPERATOR_NAMES_IT = 'Marta';
const asGuestNames = (value: string) =>
  value === LEDGER_AS_OPERATOR_NAMES_IT ? 'Your ledger' : value;

/**
 * The same events as the guest reads them, on a person ledger: amounts flip
 * sign as the balance does, and the ledger goes by the guest's name for it.
 */
export function historyAsGuestSees(events: HistoryEvent[]): HistoryEvent[] {
  return events.map((event) => ({
    ...event,
    amount: -event.amount,
    changes: event.changes.map((change) => ({
      ...change,
      before: asGuestNames(change.before),
      after: asGuestNames(change.after),
    })),
  }));
}

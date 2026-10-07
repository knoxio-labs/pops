import { type Account, accounts } from './accounts';

/**
 * Fictional sharing data for the shared-accounts screens: who an account is
 * shared with, what the guest who signs in sees, and the entries both sides
 * add to a person ledger.
 *
 * A grant names an exact email and nothing else. The operator never types a
 * display name, so no screen built on these fixtures shows one.
 */
export type GrantRole = 'view' | 'edit';

export const ROLE_LABEL: Record<GrantRole, string> = { view: 'Can view', edit: 'Can edit' };

export const ROLE_OPTIONS: { value: GrantRole; label: string }[] = [
  { value: 'view', label: 'Can view' },
  { value: 'edit', label: 'Can edit' },
];

export const OPERATOR_EMAIL = 'alex@costa.example';
export const GUEST_EMAIL = 'marta@ferreira.example';

export interface AccountGrant {
  email: string;
  role: GrantRole;
  addedOn: string;
}

export const grants: AccountGrant[] = [
  { email: GUEST_EMAIL, role: 'edit', addedOn: '2026-08-14' },
  { email: 'dana@whitlock.example', role: 'view', addedOn: '2026-09-02' },
];

/** An account as a guest's session lists it: the account, and the role granted on it. */
export interface SharedAccount {
  account: Account;
  role: GrantRole;
}

const byId = (id: string): Account => {
  const account = accounts.find((candidate) => candidate.id === id);
  if (!account) throw new Error(`No fixture account ${id}`);
  return account;
};

/** The operator's ledger with the guest, stored in the operator's terms: positive is owed to the operator. */
export const personLedger: Account = { ...byId('a7'), balance: 18_240, transactionCount: 7 };

export const sharedAccounts: SharedAccount[] = [
  { account: personLedger, role: 'edit' },
  { account: byId('a5'), role: 'view' },
];

/**
 * A person ledger is stored from the operator's side, so a guest reading it
 * raw would see their own debt in green under their own name. The guest's
 * view flips the sign and drops the operator's label for them: negative is
 * money the guest owes, which is the rule every other balance already follows.
 * Any other kind of account reads the same from both sides.
 */
export function asGuestSees(account: Account): Account {
  if (account.kind !== 'person') return account;
  return { ...account, name: 'Your ledger', contact: undefined, balance: -account.balance };
}

/**
 * The word beside a guest's balance. Only a person ledger needs one: its sign
 * says the guest is down, and the word says to whom.
 */
export function guestLedgerNote(account: Account): string {
  if (account.kind !== 'person') return '';
  if (account.balance === 0) return 'Settled up';
  return account.balance < 0 ? 'You owe' : 'You are owed';
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  date: string;
  description: string;
  type: 'purchase' | 'refund' | 'transfer';
  /** Minor units, signed in the account's own terms. */
  amount: number;
  /** Who entered it. Absent when the bank import did. */
  byEmail?: string;
  /** How many files are attached. */
  files: number;
}

export const ledgerEntries: LedgerEntry[] = [
  {
    id: 'e1',
    accountId: 'a7',
    date: '2026-09-28',
    description: 'Dinner at Sample Trattoria',
    type: 'refund',
    amount: 8_600,
    byEmail: OPERATOR_EMAIL,
    files: 2,
  },
  {
    id: 'e2',
    accountId: 'a7',
    date: '2026-09-24',
    description: 'Groceries for the house',
    type: 'purchase',
    amount: -4_250,
    byEmail: GUEST_EMAIL,
    files: 1,
  },
  {
    id: 'e3',
    accountId: 'a7',
    date: '2026-09-20',
    description: 'Concert tickets',
    type: 'refund',
    amount: 12_000,
    byEmail: OPERATOR_EMAIL,
    files: 1,
  },
  {
    id: 'e4',
    accountId: 'a7',
    date: '2026-09-15',
    description: 'Repayment',
    type: 'transfer',
    amount: -10_000,
    byEmail: GUEST_EMAIL,
    files: 0,
  },
  {
    id: 'e5',
    accountId: 'a7',
    date: '2026-09-09',
    description: 'Pharmacy',
    type: 'refund',
    amount: 3_290,
    byEmail: OPERATOR_EMAIL,
    files: 0,
  },
  {
    id: 'e6',
    accountId: 'a7',
    date: '2026-09-02',
    description: 'Taxi to the airport',
    type: 'purchase',
    amount: -5_400,
    byEmail: GUEST_EMAIL,
    files: 1,
  },
  {
    id: 'e7',
    accountId: 'a7',
    date: '2026-08-21',
    description: 'Furniture delivery',
    type: 'refund',
    amount: 14_000,
    byEmail: OPERATOR_EMAIL,
    files: 0,
  },
  {
    id: 'e8',
    accountId: 'a5',
    date: '2026-09-26',
    description: 'Farmers market',
    type: 'purchase',
    amount: -3_200,
    byEmail: OPERATOR_EMAIL,
    files: 1,
  },
  {
    id: 'e9',
    accountId: 'a5',
    date: '2026-09-12',
    description: 'Cash withdrawal',
    type: 'transfer',
    amount: 10_000,
    byEmail: OPERATOR_EMAIL,
    files: 0,
  },
];

/** An entry's amount as the guest reads it: flipped on a person ledger, as the balance is. */
export function guestAmount(entry: LedgerEntry, account: Account): number {
  return account.kind === 'person' ? -entry.amount : entry.amount;
}

/** Who did something, relative to whoever is looking: you, the other person's email, or the system. */
export function actorLabel(byEmail: string | undefined, viewerEmail: string): string {
  if (byEmail === undefined) return 'System';
  return byEmail === viewerEmail ? 'You' : byEmail;
}

/**
 * What an entry on a person ledger was, from the guest's side. The stored
 * type is the operator's (a purchase is the guest paying for something of the
 * operator's), which is not a word the guest should have to decode.
 */
export function guestEntryNote(entry: LedgerEntry): string {
  const theyPaid = entry.amount > 0;
  if (entry.type === 'transfer') return theyPaid ? 'They paid you' : 'You repaid them';
  return theyPaid ? 'They paid for you' : 'You paid for them';
}

import { currenciesByCode } from '@/fixtures/currencies';

/**
 * Which way money moves, and the only thing that decides the sign of what gets
 * written. The amount field itself never carries one.
 *
 * Balances and amounts are ledger-signed everywhere in POPS: positive is money
 * you can use and renders green, negative is money you owe and renders red. So
 * `out` writes a negative delta on the account the money leaves, `in` writes a
 * positive one, and `transfer` writes both — a negative on the from account and
 * the matching positive on the to account, which sum to zero. A transfer
 * therefore moves two balances and changes net worth by nothing, which is why
 * it must never be counted as spending.
 */
export type TransactionType = 'out' | 'in' | 'transfer';

/** The canvas's fixed today, so a "future date" is reproducible on any machine. */
export const TODAY = '2026-09-03';

export interface TransactionDraft {
  type: TransactionType;
  /** For `out` and `in`, the account. For `transfer`, the account money leaves. */
  accountId?: string;
  /** `transfer` only: the account money arrives in. */
  toAccountId?: string;
  /** Magnitude as typed, in major units. Never signed. */
  amount: string;
  date: string;
  description: string;
}

/** Minor units for a magnitude typed in major units; `NaN` when it is not a number. */
export function toMinorUnits(amount: string, currency: string): number {
  const decimals = currenciesByCode.get(currency)?.decimals ?? 2;
  return Math.round(Number(amount.replaceAll(',', '').trim()) * 10 ** decimals);
}

/** Major units for a stored minor-unit magnitude, as the amount field wants it. */
export function toMajorUnits(minorUnits: number, currency: string): string {
  const decimals = currenciesByCode.get(currency)?.decimals ?? 2;
  return (Math.abs(minorUnits) / 10 ** decimals).toFixed(decimals);
}

export interface LedgerEntry {
  accountId: string;
  delta: number;
}

/** Which end of a movement an entry sits on. Only a transfer has both. */
export type EntrySide = 'from' | 'to';

/**
 * The one place the sign rule is applied. Everything that shows or writes a
 * signed figure goes through here, so a preview can never disagree with what
 * saving would do.
 */
export function deltaFor(type: TransactionType, side: EntrySide, magnitude: number): number {
  if (type === 'transfer') return side === 'from' ? -magnitude : magnitude;
  return type === 'out' ? -magnitude : magnitude;
}

/**
 * The ledger entries a draft would write. One for `out`/`in`, two for a
 * transfer — and the pair is derived from a single magnitude here rather than
 * from two fields, so the two sides cannot be made to disagree.
 */
export function entriesFor(draft: TransactionDraft, minorUnits: number): LedgerEntry[] {
  const magnitude = Math.abs(minorUnits);
  const from = draft.accountId
    ? [{ accountId: draft.accountId, delta: deltaFor(draft.type, 'from', magnitude) }]
    : [];
  if (draft.type !== 'transfer') return from;
  const to = draft.toAccountId
    ? [{ accountId: draft.toAccountId, delta: deltaFor(draft.type, 'to', magnitude) }]
    : [];
  return [...from, ...to];
}

export interface TransactionErrors {
  account?: string;
  toAccount?: string;
  amount?: string;
  date?: string;
}

const ACCOUNT_MISSING: Record<TransactionType, string> = {
  out: 'Choose the account the money left.',
  in: 'Choose the account the money arrived in.',
  transfer: 'Choose the account the money leaves.',
};

function amountError(amount: string, minorUnits: number): string | undefined {
  const typed = amount.trim();
  if (!typed) return 'Enter an amount.';
  if (typed.startsWith('-')) {
    return 'Enter the amount without a sign — the direction above decides it.';
  }
  if (Number.isNaN(minorUnits)) return 'That is not an amount.';
  if (minorUnits === 0) return 'Zero has nothing to record.';
  return undefined;
}

function transferErrors(draft: TransactionDraft): TransactionErrors {
  if (!draft.toAccountId) return { toAccount: 'Choose the account the money arrives in.' };
  if (draft.toAccountId === draft.accountId) {
    return { toAccount: 'A transfer needs two different accounts.' };
  }
  return {};
}

/**
 * Everything wrong with a draft, keyed by the field that shows it. A future
 * date is an error rather than a warning: every entry this form makes is a
 * movement that already happened, and a future one is a mistyped year.
 */
export function validate(draft: TransactionDraft, minorUnits: number): TransactionErrors {
  return {
    account: draft.accountId ? undefined : ACCOUNT_MISSING[draft.type],
    ...(draft.type === 'transfer' ? transferErrors(draft) : {}),
    amount: amountError(draft.amount, minorUnits),
    date: draft.date > TODAY ? 'That date has not happened yet.' : undefined,
  };
}

export function hasErrors(errors: TransactionErrors): boolean {
  return Object.values(errors).some(Boolean);
}

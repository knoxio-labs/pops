import { formatBalance } from '@/fixtures/currencies';

import type { Transaction, TransactionDetail } from '@/fixtures/transactions';

/**
 * How the phone reads a transaction. Every rule here is the app's
 * (`FeatureTransactions/TransactionPresentation.swift` and
 * `TransactionDetailPresentation.swift`) rather than this playground's, so a
 * design reviewed on these screens is reviewed on the numbers the device
 * would actually draw.
 */

/** Money arriving. The sign is the server's; nothing is re-derived here. */
export function isCredit(transaction: Pick<Transaction, 'amountMinorUnits'>): boolean {
  return transaction.amountMinorUnits > 0;
}

/**
 * Spending is never destructive-red. That token means "this failed" elsewhere
 * in the app, and an ordinary purchase is not a failure — only a credit is
 * tinted at all.
 */
export function amountColour(transaction: Pick<Transaction, 'amountMinorUnits'>): string {
  return isCredit(transaction) ? 'var(--ios-success)' : 'var(--ios-foreground)';
}

export function amountText(transaction: Transaction): string {
  return formatBalance(transaction.amountMinorUnits, transaction.currency);
}

const dateText = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/** With a clock time, which only "Last edited" is shown with. */
const stampText = (iso: string) =>
  `${dateText(iso)} at ${new Date(iso).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;

export { dateText as transactionDate, stampText as transactionStamp };

/**
 * The entity and the date, and only the date when the server sent no entity —
 * a row degrades to what it has rather than to a dash.
 */
export function rowSubtitle(transaction: Transaction): string {
  return [transaction.entityName, dateText(transaction.date)].filter(Boolean).join(' · ');
}

/** The type is always present; tags follow it in the order they arrived. */
export function rowCaption(transaction: Transaction): string {
  return [transaction.type, ...transaction.tags].join(' · ');
}

export interface DetailField {
  label: string;
  value: string;
}

const present = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== '';

/**
 * The labelled lines under the heading. The three the list row already
 * carries come first and never move, so nothing reorders under the reader
 * when the fuller record lands; a field with no value is absent rather than
 * blank.
 */
export function detailFields(transaction: Transaction, detail?: TransactionDetail): DetailField[] {
  const tags = transaction.tags.join(', ');
  const pairs: [string, string | undefined][] = [
    ['Type', transaction.type],
    ['Entity', transaction.entityName],
    ['Tags', tags],
    ['Account', detail?.account],
    ['Location', detail?.location],
    ['Country', detail?.country],
    ['Notes', detail?.notes],
    ['Last edited', detail?.lastEditedAt ? stampText(detail.lastEditedAt) : undefined],
  ];
  return pairs
    .filter((pair): pair is [string, string] => present(pair[1]))
    .map(([label, value]) => ({ label, value }));
}

export type RepositoryFailure =
  | 'unavailable'
  | 'unauthorized'
  | 'contractMismatch'
  | 'transport'
  | 'dependencyNotBound';

/** `TransactionsCopy.message(for:)`, verbatim — the sentence the reader sees. */
export const FAILURE_MESSAGE: Record<RepositoryFailure, string> = {
  unavailable:
    'Your transactions are temporarily unreachable. Nothing is lost — try again in a moment.',
  unauthorized: 'This device is no longer signed in.',
  contractMismatch: 'This version of Pops cannot read what the server sent. Update the app.',
  transport: 'Could not reach the server. Check your connection and try again.',
  dependencyNotBound: 'Pops is not set up correctly on this device.',
};

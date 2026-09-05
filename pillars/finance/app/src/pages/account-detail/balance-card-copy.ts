import { getAccountKindBehaviour } from '@pops/finance';
import { ACCOUNT_KIND_META } from '@pops/ui';

import type { Account } from '../accounts/types';

type Balance = Account['balance'];

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/**
 * The line over the headline number. It names what the account is, not what
 * its sign means — the number carries that itself. The person ledger is the
 * exception: a minus sign cannot say who is owed, so that one keeps a sentence
 * naming the contact.
 */
export function balanceCaption(account: Account): string {
  if (account.kind === 'person') {
    const who = account.entityDisplayName ?? account.name;
    if (account.balance.balanceCents === 0) return `Settled up with ${who}`;
    return account.balance.balanceCents > 0 ? `${who} owes you` : `You owe ${who}`;
  }
  if (getAccountKindBehaviour(account.kind).isStoredValue) return 'Remaining stored value';
  return `${ACCOUNT_KIND_META[account.kind].label} balance`;
}

/**
 * Where the number came from.
 *
 * Every kind can take a checkpoint; what differs is who supplied it. A bank or
 * a card issuer publishes a balance to check against, a wallet or a person
 * ledger only has what you counted — so `hasExternalBalance` chooses the
 * wording, and never whether the feature exists.
 *
 * A `transactions` basis is net flow since whatever date the import happened
 * to start on, and says so rather than passing for a balance. There is never a
 * placeholder date.
 */
export function provenanceLine(account: Account, balance: Balance): string {
  if (balance.basis === 'checkpoint') return `As of ${day(balance.asOf)}`;
  return getAccountKindBehaviour(account.kind).hasExternalBalance
    ? 'Derived from transactions; never checked against the bank'
    : 'Derived from transactions; never counted';
}

/**
 * Where the balance has travelled over the series, said plainly. The sparkline
 * it captions is drawn in the balance's own tone, so a loan climbing toward
 * zero stays red — it is a negative number getting less negative, and it is
 * still debt.
 */
export function trendLine(
  points: { balanceCents: number }[],
  format: (amount: number) => string
): string {
  const change = (points.at(-1)?.balanceCents ?? 0) - (points.at(0)?.balanceCents ?? 0);
  return `${change >= 0 ? 'Up' : 'Down'} ${format(Math.abs(change))} over ${points.length} months`;
}

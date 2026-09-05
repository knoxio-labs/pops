import { ACCOUNT_KINDS, sideNoun } from '@/fixtures/account-kinds';
import { checkpointsFor } from '@/fixtures/checkpoints';
import { currenciesByCode, formatBalance } from '@/fixtures/currencies';
import { institutionsById } from '@/fixtures/institutions';

import type { Account } from '@/fixtures/accounts';

/**
 * Ledger-signed, always: positive is money you can use, negative is money
 * you owe, and the colour follows that sign directly rather than the
 * account's kind. Points are not money and never take a money tone, no
 * matter their sign.
 */
export type BalanceTone = 'positive' | 'negative' | 'neutral';

export interface BalanceReading {
  amount: string;
  /** The counterparty word a bare sign cannot supply: who owes whom. */
  note?: string;
  tone: BalanceTone;
}

function isPointsAccount(account: Account): boolean {
  return currenciesByCode.get(account.currency)?.kind === 'points';
}

export function toneForBalance(balance: number): BalanceTone {
  if (balance > 0) return 'positive';
  if (balance < 0) return 'negative';
  return 'neutral';
}

/** The amount as its own sign, the counterparty word a ledger needs, and the tone. */
export function readBalance(account: Account): BalanceReading {
  const amount = formatBalance(account.balance, account.currency);
  if (isPointsAccount(account)) return { amount, tone: 'neutral' };
  const tone = toneForBalance(account.balance);
  if (ACCOUNT_KINDS[account.kind].side !== 'either' || account.balance === 0) {
    return { amount, tone };
  }
  return { amount, tone, note: account.balance < 0 ? 'you owe' : 'owed to you' };
}

/** The sentence over the headline number on the account's own screen. */
export function balanceCaption(account: Account): string {
  const kind = ACCOUNT_KINDS[account.kind];
  const who = account.contact ?? account.name;
  if (kind.side === 'either') {
    return account.balance >= 0 ? `${who} owes you` : `You owe ${who}`;
  }
  if (kind.storedValue) return 'Remaining stored value';
  if (kind.side === 'liability') {
    return account.balance < 0 ? 'Owed on this account' : 'In credit on this account';
  }
  return `Balance ${sideNoun(kind.side)}`;
}

export function iosTone(tone: BalanceTone): string {
  if (tone === 'positive') return 'var(--ios-success)';
  if (tone === 'negative') return 'var(--ios-destructive)';
  return 'var(--ios-foreground)';
}

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });

/** The institution, the contact, or failing both the kind: who this account is with. */
export function accountSubtitle(account: Account): string {
  const institution = account.institutionId
    ? institutionsById.get(account.institutionId)?.name
    : undefined;
  return institution ?? account.contact ?? ACCOUNT_KINDS[account.kind].label;
}

/** When the number was last true, phrased so a derived balance never claims to be checked. */
export function asOfNote(account: Account): string {
  if (account.balanceAsOf) return `As of ${day(account.balanceAsOf)}`;
  const external = ACCOUNT_KINDS[account.kind].checkpointable;
  if (checkpointsFor(account.id).length > 0) {
    return external ? 'Since the last checkpoint' : 'Since you last counted it';
  }
  return external ? 'Never checked against the bank' : 'Never counted';
}

export { day as iosDay };

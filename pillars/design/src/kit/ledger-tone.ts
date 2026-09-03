import { currenciesByCode } from '@/fixtures/currencies';

import type { Account } from '@/fixtures/accounts';

/**
 * The invariant every account surface rests on. Balances are ledger-signed
 * everywhere: a positive number is money you can use, a negative number is
 * money you owe. Colour follows that sign and nothing else — never the
 * account's kind, never a direction word printed beside the number — which is
 * why a loan is always red until the day it clears, and why nothing negates a
 * balance before showing it.
 *
 * Two things sit deliberately outside the rule. A balance denominated in
 * points is not money that can be spent, so it stays neutral however large it
 * grows. And a magnitude — an amount owed, a repayment, a month's interest —
 * is not a ledger balance, so it takes no tone at all: only a figure that is
 * green may be read as spendable.
 */
export type LedgerTone = 'text-primary' | 'text-destructive' | 'text-muted-foreground';

/** The tone a ledger-signed figure is shown in. */
export function ledgerTone(amount: number): LedgerTone {
  if (amount > 0) return 'text-primary';
  if (amount < 0) return 'text-destructive';
  return 'text-muted-foreground';
}

/** An account's balance tone: the sign rule, except points, which are not money. */
export function balanceTone(account: Account): LedgerTone {
  if (currenciesByCode.get(account.currency)?.kind === 'points') return 'text-muted-foreground';
  return ledgerTone(account.balance);
}

/**
 * The invariant every account balance surface rests on (POPS-2750). Balances
 * are ledger-signed everywhere: a positive figure is money held, a negative
 * one is money owed — for assets and liabilities alike. Colour follows that
 * sign and nothing else, never the account's kind, which is why a loan reads
 * red until the day it clears and why nothing negates a balance before
 * showing it.
 *
 * A points balance sits outside the rule: it is not money that can be spent,
 * so it stays neutral however large it grows.
 */
export type LedgerTone = 'text-primary' | 'text-destructive' | 'text-muted-foreground';

/** The tone a ledger-signed figure is shown in, from its sign alone. */
export function ledgerTone(amount: number): LedgerTone {
  if (amount > 0) return 'text-primary';
  if (amount < 0) return 'text-destructive';
  return 'text-muted-foreground';
}

/** A balance's tone: the sign rule, except a points balance, which is never money. */
export function balanceTone(amount: number, currencyKind: 'fiat' | 'points'): LedgerTone {
  if (currencyKind === 'points') return 'text-muted-foreground';
  return ledgerTone(amount);
}

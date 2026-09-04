import { currenciesByCode } from '@/fixtures/currencies';

import type { Account } from '@/fixtures/accounts';

/**
 * Decision (POPS-2813, design review 2026-09-03): a total exists only per
 * currency, never blended across them. AUD and EUR cannot be added without an
 * exchange rate, and a rate needs a source, a date and a staleness story none
 * of which exists yet — a silent conversion would be worse than the current
 * omission. A net-worth figure is deferred to whenever that infrastructure
 * lands, not built here.
 *
 * Points are excluded entirely, in every currency they appear in: they are
 * not money (POPS-2802), and `formatBalance` already refuses to give them a
 * dollar face. Archived accounts are excluded — they're out of every other
 * total and pick surface, so they stay out of this one too.
 *
 * `account.balance` is ledger-signed uniformly (`ledger-tone.ts`), so a
 * plain sum already nets assets against liabilities within the same
 * currency — a credit card's negative balance reduces its currency's
 * subtotal without any kind-specific casing here.
 */
export interface CurrencySubtotal {
  currency: string;
  total: number;
}

export function currencySubtotals(accounts: Account[]): CurrencySubtotal[] {
  const totals = new Map<string, number>();
  for (const account of accounts) {
    if (account.archived) continue;
    if (currenciesByCode.get(account.currency)?.kind === 'points') continue;
    totals.set(account.currency, (totals.get(account.currency) ?? 0) + account.balance);
  }
  return [...totals.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => ({ currency, total }));
}

import type { CurrenciesListResponses } from '../../finance-api/index.js';
import type { Account } from './types';

export type Currency = CurrenciesListResponses[200]['data'][number];

/** One currency's net balance across the accounts summed into it. */
export interface CurrencySubtotal {
  currency: string;
  totalCents: number;
}

/**
 * A total exists only per currency, never blended across them (POPS-2813,
 * ported from the design's `kit/account-subtotals.ts`): AUD and EUR cannot be
 * added without an exchange rate, and a rate needs a source, a date and a
 * staleness story none of which exists yet.
 *
 * Points are excluded entirely, in every currency they appear in — they are
 * not money. Archived accounts are excluded — they're out of every other
 * total and pick surface, so they stay out of this one too.
 *
 * `balance.balanceCents` is ledger-signed uniformly, so a plain sum already
 * nets assets against liabilities within the same currency — a credit card's
 * negative balance reduces its currency's subtotal without any kind-specific
 * casing here.
 */
export function currencySubtotals(accounts: Account[], currencies: Currency[]): CurrencySubtotal[] {
  const kindByCode = new Map(currencies.map((c) => [c.code, c.kind]));
  const totals = new Map<string, number>();
  for (const account of accounts) {
    if (account.archivedAt !== null) continue;
    if (kindByCode.get(account.currency) === 'points') continue;
    totals.set(
      account.currency,
      (totals.get(account.currency) ?? 0) + account.balance.balanceCents
    );
  }
  return [...totals.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([currency, totalCents]) => ({ currency, totalCents }));
}

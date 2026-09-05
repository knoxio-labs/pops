import { describe, expect, it } from 'vitest';

import { centsToDollars, formatBalance } from '@pops/finance';

import { currencyFormat, formatBalanceCents } from './balance-display';

import type { Currency } from './account-subtotals';

const AUD: Currency = {
  code: 'AUD',
  name: 'Australian Dollar',
  symbol: '$',
  decimals: 2,
  kind: 'fiat',
  createdAt: '',
};
const QFF: Currency = {
  code: 'QFF',
  name: 'Qantas Points',
  symbol: null,
  decimals: 0,
  kind: 'points',
  createdAt: '',
};

describe('formatBalanceCents', () => {
  it('divides by a flat 100 for a points currency, not by its zero display decimals', () => {
    // The pillar persists every monetary value as integer hundredths whatever
    // the currency prints (`money.ts`, CF041), and a points checkpoint is
    // written through the same `dollarsToCents`. Scaling by `decimals` would
    // read this balance as 1,250,000 pts here while the account detail card,
    // which goes through `centsToDollars`, read the same number as 12,500.
    expect(formatBalanceCents(1_250_000, currencyFormat([QFF], 'QFF'))).toBe('12,500 pts');
  });

  it('agrees with the account page, which formats the same field via centsToDollars', () => {
    const format = currencyFormat([QFF], 'QFF');
    expect(formatBalanceCents(1_250_000, format)).toBe(
      formatBalance(centsToDollars(1_250_000), format)
    );
  });

  it('renders fiat in the currency symbol with its own decimals', () => {
    expect(formatBalanceCents(-213_755, currencyFormat([AUD], 'AUD'))).toBe('-$2,137.55');
  });

  it('falls back to fiat with 2 decimals for a code the currencies list never carried', () => {
    expect(formatBalanceCents(100_000, currencyFormat([AUD], 'XXX'))).toBe('1,000.00');
  });
});

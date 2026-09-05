import { centsToDollars, formatBalance, type CurrencyFormat } from '@pops/finance';

import type { Currency } from './account-subtotals';

/** A safe guess for a currency code that never resolved: fiat, 2 decimals, no symbol. */
const FALLBACK_CURRENCY: CurrencyFormat = { symbol: null, decimals: 2, kind: 'fiat' };

/** The currency row for a code, falling back to an honest fiat guess when it never resolved. */
export function currencyFormat(currencies: Currency[], code: string): CurrencyFormat {
  return currencies.find((currency) => currency.code === code) ?? FALLBACK_CURRENCY;
}

/**
 * A ledger-signed minor-units figure (`balanceCents`) as `formatBalance`
 * text. `formatBalance` takes a decimal already in the currency's own units,
 * so the division happens here rather than at each call site.
 *
 * `centsToDollars`, not `10 ** currency.decimals`: the pillar persists every
 * monetary value as integer hundredths whatever the currency's display
 * precision (`money.ts`, CF041), and a points checkpoint is written through
 * the same `dollarsToCents`. Scaling by `decimals` would read a points
 * balance 100x too large here while the account page — which goes through
 * `centsToDollars` — read it correctly, for the same stored number.
 */
export function formatBalanceCents(cents: number, currency: CurrencyFormat): string {
  return formatBalance(centsToDollars(cents), currency);
}

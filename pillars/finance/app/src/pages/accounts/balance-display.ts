import { formatBalance, type CurrencyFormat } from '@pops/finance';

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
 * not minor units, so this is the one place that division happens for a
 * balance rather than each call site repeating it.
 */
export function formatBalanceCents(cents: number, currency: CurrencyFormat): string {
  return formatBalance(cents / 10 ** currency.decimals, currency);
}

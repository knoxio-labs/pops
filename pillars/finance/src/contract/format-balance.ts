import type { CurrencyKind } from './currency-kind.js';

/** The currency fields {@link formatBalance} needs — a `currencies` row projection. */
export interface CurrencyFormat {
  symbol: string | null;
  decimals: number;
  kind: CurrencyKind;
}

/**
 * Render a balance as a string. The single place a balance becomes text
 * (POPS-2802) — every other call site passes the currency through, not a
 * hand-rolled `toFixed`/symbol concatenation.
 *
 * `amount` is a decimal value already in the currency's own units (dollars
 * for AUD, whole points for a points balance) — not minor units. Fiat
 * renders as `<symbol><amount>` with thousands separators and exactly
 * `decimals` fraction digits (e.g. `$1,234.56`); points render as
 * `<amount> pts` with no symbol and no fraction digits, using `decimals`
 * from the currency row as-is (always 0 for a points {@link CurrencyKind})
 * rather than a hardcoded 0/2 split. A negative amount keeps its sign in
 * front of the symbol (`-$12.00`).
 */
export function formatBalance(amount: number, currency: CurrencyFormat): string {
  const magnitude = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  });
  const sign = amount < 0 ? '-' : '';

  if (currency.kind === 'points') return `${sign}${magnitude} pts`;
  return `${sign}${currency.symbol ?? ''}${magnitude}`;
}

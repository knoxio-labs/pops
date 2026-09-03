/**
 * Currencies are a table, not a union: an account can be denominated in
 * anything countable that has a balance, which is how rewards points fit
 * beside dollars without a second concept.
 */
export interface Currency {
  code: string;
  name: string;
  symbol: string;
  /** Minor units. Points have none. */
  decimals: number;
  kind: 'fiat' | 'points';
}

export const currencies: Currency[] = [
  { code: 'AUD', name: 'Australian dollar', symbol: '$', decimals: 2, kind: 'fiat' },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, kind: 'fiat' },
  { code: 'USD', name: 'US dollar', symbol: '$', decimals: 2, kind: 'fiat' },
  { code: 'BRL', name: 'Brazilian real', symbol: 'R$', decimals: 2, kind: 'fiat' },
  { code: 'QFF', name: 'Qantas Points', symbol: '', decimals: 0, kind: 'points' },
  { code: 'MR', name: 'Membership Rewards', symbol: '', decimals: 0, kind: 'points' },
];

export const currenciesByCode = new Map(currencies.map((c) => [c.code, c]));

/** A balance in its own currency: dollars get a symbol and cents, points do not. */
export function formatBalance(minorUnits: number, code: string): string {
  const currency = currenciesByCode.get(code);
  if (!currency) return `${minorUnits} ${code}`;
  const value = minorUnits / 10 ** currency.decimals;
  const text = value.toLocaleString('en-AU', {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  });
  if (currency.kind === 'points') return `${text} pts`;
  return `${value < 0 ? '-' : ''}${currency.symbol}${text.replace('-', '')}`;
}

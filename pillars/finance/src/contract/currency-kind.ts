/**
 * What a row in `currencies` denominates (POPS-2802).
 *
 * The distinction exists so a balance can be formatted without inspecting
 * `symbol`/`decimals` for absence: `kind` alone tells the formatter which of
 * the two rendering rules applies.
 */
export const CURRENCY_KINDS = [
  /** An ISO 4217 currency — has a symbol, and `decimals` is its minor-unit count. */
  'fiat',
  /** A rewards-points balance — no symbol, `decimals` is always 0. */
  'points',
] as const;

/** One member of {@link CURRENCY_KINDS}. */
export type CurrencyKind = (typeof CURRENCY_KINDS)[number];

/**
 * The foreign-charge columns a transaction carries, and the projection shared
 * by every wire shape that repeats them.
 *
 * Split from `transactions-types.ts`, which is at its per-file line cap.
 */

/** Set together or not at all: an overseas charge, or a domestic one. */
export interface ForeignChargeFields {
  /**
   * Amount charged abroad, in `foreignCurrency`'s own ISO-4217 minor units —
   * `1100` is ¥1,100 for JPY (no minor unit) and $11.00 for USD.
   */
  foreignAmountMinor: number | null;
  /** ISO-4217 alpha-3 of the charge abroad. */
  foreignCurrency: string | null;
  /** The issuer's foreign-transaction FEE in AUD cents, not a converted total. */
  fxFeeCents: number | null;
}

export function foreignChargeFields(source: ForeignChargeFields): ForeignChargeFields {
  return {
    foreignAmountMinor: source.foreignAmountMinor,
    foreignCurrency: source.foreignCurrency,
    fxFeeCents: source.fxFeeCents,
  };
}

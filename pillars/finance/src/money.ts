/**
 * The finance pillar's money boundary (#3665, CF041): every monetary value is
 * persisted and computed as integer cents; a decimal-dollar `number` exists
 * only at the wire edge (REST request/response bodies, AI-prompt display
 * text). These two helpers are the ONLY place a dollars↔cents conversion may
 * happen — everywhere else, an `amount` in code is unambiguously one or the
 * other by its type/name (`amountCents` vs `amount`).
 *
 * `dollarsToCents` rounds rather than truncates so a value that isn't exactly
 * representable in IEEE-754 (e.g. `19.99`, `0.1 + 0.2`) lands on the intended
 * cent instead of one cent short.
 */

const CENTS_PER_DOLLAR = 100;

/** Convert a decimal-dollar amount (e.g. `19.99`) to integer cents (`1999`). */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * CENTS_PER_DOLLAR);
}

/** Convert integer cents (e.g. `1999`) to a decimal-dollar amount (`19.99`). */
export function centsToDollars(cents: number): number {
  return cents / CENTS_PER_DOLLAR;
}

/** {@link dollarsToCents}, passing through `null`/`undefined` unchanged. */
export function dollarsToCentsNullable(dollars: number | null | undefined): number | null {
  if (dollars === null || dollars === undefined) return null;
  return dollarsToCents(dollars);
}

/** {@link centsToDollars}, passing through `null`/`undefined` unchanged. */
export function centsToDollarsNullable(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  return centsToDollars(cents);
}

export const ALL_TIME = 'all';

const YEARS_OFFERED = 5;

export type PeriodSelection = typeof ALL_TIME | string;

export interface PeriodRange {
  from?: string;
  to?: string;
}

/**
 * The years the picker offers, newest first, after "all time".
 *
 * Derived from the clock rather than from the data. Deriving it from the
 * response would need a roll-up over all time before the first render, and
 * offering only the years that already have orders hides the fact that a year
 * is empty behind the year being missing.
 */
export function periodYears(now: Date): string[] {
  const current = now.getUTCFullYear();
  return Array.from({ length: YEARS_OFFERED }, (_, index) => String(current - index));
}

/**
 * The `from`/`to` a selection puts on the wire.
 *
 * Both bounds are inclusive server-side, so a year ends at its last second
 * rather than at the next year's first instant — `2026-12-31T23:59:59Z` cannot
 * catch a midnight order that belongs to 2027.
 */
export function periodRange(selection: PeriodSelection): PeriodRange {
  if (selection === ALL_TIME) return {};
  return {
    from: `${selection}-01-01T00:00:00Z`,
    to: `${selection}-12-31T23:59:59Z`,
  };
}

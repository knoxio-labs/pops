import type { SpendPeriod } from '@/fixtures/purchases-merchant-spend';

export const ALL_TIME = 'all';

const YEARS_OFFERED = 5;

/** A calendar year, spelled the way the picker offers it. */
export type YearSelection = `${number}`;

/**
 * A union rather than `typeof ALL_TIME | string`, which collapses to `string`
 * and constrains nothing — `selection === ALL_TIME` then narrows the other
 * branch to `string`, so nothing downstream can rely on it being a year.
 */
export type PeriodSelection = typeof ALL_TIME | YearSelection;

function isYear(value: string): value is YearSelection {
  return /^\d{4}$/u.test(value);
}

/**
 * Narrow an arbitrary string — today a `<select>` value — to a selection
 * this view can act on. Anything unrecognised falls back to all time, which
 * shows *more* than was asked for rather than less: the opposite default
 * would let a bad value silently scope spend away.
 */
export function parsePeriodSelection(value: string): PeriodSelection {
  if (value === ALL_TIME) return ALL_TIME;
  return isYear(value) ? value : ALL_TIME;
}

/**
 * The years the picker offers, newest first, after "all time". Derived from
 * the clock rather than from the data, so an empty year is still offered
 * rather than hidden behind having no orders.
 */
export function periodYears(now: Date): YearSelection[] {
  const current = now.getUTCFullYear();
  return Array.from({ length: YEARS_OFFERED }, (_, index): YearSelection => `${current - index}`);
}

/**
 * The window a selection asks for. All time asks for everything, so both
 * bounds are `null`.
 *
 * This is what the picker would send, not what the screen reports: the
 * "Covering …" line echoes the window the response came back with, because a
 * picker that has already moved while a refetch is in flight would otherwise
 * caption one window's figures with another's.
 *
 * Bare dates rather than instants: an offset-bearing bound rendered through a
 * local formatter reads as a different year either side of Greenwich, and the
 * playground has no wire to sort against.
 */
export function periodToSpendPeriod(selection: PeriodSelection): SpendPeriod {
  if (selection === ALL_TIME) return { from: null, to: null };
  return { from: `${selection}-01-01`, to: `${selection}-12-31` };
}

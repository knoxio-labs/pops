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
 * The lower bound carries the longest fraction the timestamp schema allows and
 * the upper bound carries none. The asymmetry is deliberate — see
 * {@link periodRange}.
 */
const YEAR_START = '-01-01T00:00:00.000000000Z';
const YEAR_END = '-12-31T23:59:59Z';

/**
 * The `from`/`to` a selection puts on the wire.
 *
 * Both bounds are inclusive, and the pillar compares them as **text** against
 * the stored `orderedAt` rather than as instants. The timestamp schema admits
 * an optional 1–9 digit fraction, so one instant has many spellings and they
 * do not sort together: `.` (0x2E) sorts below every digit and below `Z`.
 * That is why the two ends are spelled differently.
 *
 * The lower bound takes the longest fraction, because `…00.000000000Z` sorts
 * below every other spelling of that instant — `…00.000Z`, `…00.5Z` and the
 * bare `…00Z` all sort above it. A bare `…T00:00:00Z` bound would exclude a
 * midnight order stored with milliseconds, which receipt ingest produces.
 *
 * The upper bound takes no fraction, for the mirror-image reason: `…59Z` sorts
 * above every `…59.<frac>Z`, so it catches the whole final second. A
 * `.999999999Z` bound would exclude an order stored as `…59Z`. It also cannot
 * reach into the next year, which starting the window at the following
 * January would.
 *
 * None of this rescues a timestamp stored with a numeric UTC offset instead of
 * `Z`. Those do not compare as text meaningfully at any bound, and the fix is
 * to normalise `orderedAt` on write rather than to spell the window
 * differently here.
 */
export function periodRange(selection: PeriodSelection): PeriodRange {
  if (selection === ALL_TIME) return {};
  return {
    from: `${selection}${YEAR_START}`,
    to: `${selection}${YEAR_END}`,
  };
}

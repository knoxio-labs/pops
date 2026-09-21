/**
 * Calendar-month boundaries in the owner's timezone, as UTC instants.
 *
 * `purchases.ordered_at` is stored canonicalised to UTC (`ordered-at.ts`),
 * so a month boundary spelled in UTC would cut the last few hours of a
 * Sydney evening into the following UTC day. `Australia/Sydney` observes
 * DST (AEST UTC+10, AEDT UTC+11), so the offset a month's first instant
 * needs is not fixed — it has to be read for that specific date rather than
 * assumed.
 */

/** The owner's timezone. Every month boundary in this pillar is drawn here. */
export const OWNER_TIME_ZONE = 'Australia/Sydney';

/**
 * Minutes east of UTC that `timeZone` observes at `utcMillis`.
 *
 * Read by formatting the instant in that zone and comparing the wall-clock
 * result back to the same instant read as UTC — the standard
 * `Intl.DateTimeFormat` technique for a zone offset, since `Intl` states a
 * zone's wall time but never its offset directly.
 */
function offsetMinutesAt(utcMillis: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(utcMillis)).map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts['year']),
    Number(parts['month']) - 1,
    Number(parts['day']),
    Number(parts['hour']),
    Number(parts['minute']),
    Number(parts['second'])
  );
  return Math.round((asUtc - utcMillis) / 60_000);
}

/**
 * The UTC instant of local midnight on `year`-`monthIndex + 1`-`day` in
 * `timeZone`.
 *
 * One correction pass past the naive UTC guess: the offset at the guess and
 * the offset at the corrected instant can differ right on a DST transition
 * day, so the offset is re-read once against the corrected instant and the
 * guess redone if it moved.
 */
function utcInstantOfLocalMidnight(
  year: number,
  monthIndex: number,
  day: number,
  timeZone: string
): number {
  const naive = Date.UTC(year, monthIndex, day, 0, 0, 0);
  const firstPass = naive - offsetMinutesAt(naive, timeZone) * 60_000;
  const offsetAtCorrected = offsetMinutesAt(firstPass, timeZone);
  const secondPass = naive - offsetAtCorrected * 60_000;
  return offsetAtCorrected === offsetMinutesAt(firstPass, timeZone) ? firstPass : secondPass;
}

/** Inclusive `[from, to]` ISO-8601 UTC bounds on `orderedAt` for one calendar month. */
export interface MonthBounds {
  readonly from: string;
  readonly to: string;
}

/**
 * Parse a `YYYY-MM` month key into the calendar year and zero-based month
 * index it names. Throws on anything else — callers validate the wire
 * format before this is reached.
 */
function parseMonthKey(month: string): { year: number; monthIndex: number } {
  const match = /^(?<year>\d{4})-(?<month>\d{2})$/u.exec(month);
  const groups = match?.groups;
  if (groups === undefined) throw new Error(`[purchases] not a YYYY-MM month: ${month}`);
  const monthIndex = Number(groups['month']) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error(`[purchases] not a YYYY-MM month: ${month}`);
  }
  return { year: Number(groups['year']), monthIndex };
}

/**
 * The inclusive `orderedAt` bounds of one calendar month, in
 * {@link OWNER_TIME_ZONE}.
 *
 * `to` is one millisecond before the following month's own local midnight —
 * inclusive rather than an exclusive next-month bound, matching
 * {@link orderedAtWindow}'s `gte`/`lte` predicates.
 */
export function monthBounds(month: string): MonthBounds {
  const { year, monthIndex } = parseMonthKey(month);
  const from = utcInstantOfLocalMidnight(year, monthIndex, 1, OWNER_TIME_ZONE);
  const nextMonthIndex = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextYear = monthIndex === 11 ? year + 1 : year;
  const to = utcInstantOfLocalMidnight(nextYear, nextMonthIndex, 1, OWNER_TIME_ZONE) - 1;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

/** The `YYYY-MM` key naming the calendar month before `month`. */
export function previousMonthKey(month: string): string {
  const { year, monthIndex } = parseMonthKey(month);
  const previousMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const previousYear = monthIndex === 0 ? year - 1 : year;
  return `${String(previousYear).padStart(4, '0')}-${String(previousMonthIndex + 1).padStart(2, '0')}`;
}

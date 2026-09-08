/**
 * Local-day derivation and calendar-boundary helpers.
 *
 * Every function here is one of two kinds, and mixing them is the whole
 * defect class this module exists to prevent:
 *
 * - **Local-anchored** — reads a `Date`'s own local calendar fields
 *   (`getFullYear`/`getMonth`/`getDate`/…). This is the only correct way to
 *   answer "what day is it, for this viewer, right now" or "what are this
 *   viewer's day/week/month boundaries". `toISOString()` converts to UTC
 *   first, so in any zone ahead of UTC the local date reads a day ahead for
 *   the hours between local and UTC midnight (about ten a day in AEST), and a
 *   day behind in zones west of it.
 * - **UTC-anchored** — once a starting day is known, walking forward or
 *   backward by whole days is done with `Date.UTC` arithmetic, which is
 *   deliberately fixed-width (every step is exactly 24h, with no DST
 *   shift to correct for). Deriving the *starting* day from local fields and
 *   then walking in UTC gets both properties at once: the day you start from
 *   is the viewer's, and the days you count are never off by an hour.
 *
 * A function that walks days by re-reading local fields at each step, or
 * that derives its starting day from UTC fields, reintroduces the trap either
 * half is meant to avoid.
 */

/**
 * A `Date`'s LOCAL calendar day as `YYYY-MM-DD`. Local-anchored.
 *
 * Deliberately not `toISOString()` — see the module doc.
 */
export function toISODate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The viewer's own calendar date as `YYYY-MM-DD`. Local-anchored. */
export function todayISODate(): string {
  return toISODate(new Date());
}

/** The first instant of `date`'s local calendar day. Local-anchored. */
export function startOfLocalDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/**
 * The last instant of `date`'s local calendar day (`23:59:59.999`), not the
 * first instant of the next one. Local-anchored.
 */
export function endOfLocalDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/**
 * The Monday (ISO 8601) that starts `date`'s local calendar week, as
 * `YYYY-MM-DD`.
 *
 * The starting day is local-anchored (`date`'s own year/month/day and
 * day-of-week), but walking back to Monday is done as UTC-anchored,
 * fixed-width day arithmetic — see the module doc. Deriving the walk from
 * local fields directly (e.g. re-invoking the local `Date` constructor with a
 * decremented day) would work too, but would silently start being wrong the
 * moment someone "simplifies" it into a loop that re-reads local fields on
 * every step across a DST boundary.
 */
export function startOfWeekISODate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const localDayOfWeek = date.getDay(); // 0 (Sun) .. 6 (Sat), from local fields
  const isoDayOfWeek = localDayOfWeek === 0 ? 7 : localDayOfWeek; // 1 (Mon) .. 7 (Sun)

  const mondayUtcMs = Date.UTC(year, month, day) - (isoDayOfWeek - 1) * 86_400_000;
  return new Date(mondayUtcMs).toISOString().slice(0, 10);
}

/**
 * The first day of `date`'s local calendar month, as `YYYY-MM-DD`.
 * Local-anchored — no day-walking is needed, since the first of the month is
 * a direct reading of `date`'s own year and month.
 */
export function startOfMonthISODate(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

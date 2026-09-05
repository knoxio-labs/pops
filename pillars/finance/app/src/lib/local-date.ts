/**
 * A `Date`'s LOCAL calendar fields as `YYYY-MM-DD`.
 *
 * Deliberately not `toISOString()`, which converts to UTC first: in any zone
 * ahead of UTC the local date is a day ahead for the hours between local and
 * UTC midnight (about ten a day in AEST), and a day behind in zones west of
 * it. Anything comparing against a user-entered calendar date — a "not in the
 * future" rule, a month boundary — is wrong for those hours if it reads the
 * UTC date instead.
 */
export function toISODate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The viewer's own calendar date as `YYYY-MM-DD`. */
export function todayISODate(): string {
  return toISODate(new Date());
}

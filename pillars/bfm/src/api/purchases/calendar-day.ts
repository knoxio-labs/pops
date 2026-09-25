/**
 * The merchant-local calendar day of an instant — shared by every purchases
 * shape that shows a day: the list row, the detail, a search hit, a charge.
 */

/**
 * The calendar day an order is dated, WHERE IT WAS PLACED.
 *
 * No ambient zone takes part. A 9am Sydney shop stays the 21st on a handset
 * that has since flown to Los Angeles — where resolving the instant in the
 * device's zone would render it as the 20th and nothing on screen would say
 * why. The transactions leg beside this one shipped that mistake, which is
 * why the day is computed on this side of the wire rather than left to a
 * client.
 *
 * `offsetMinutes` is a separate argument because the instant usually cannot
 * carry it. `purchases` spells `orderedAt` in UTC so that a text comparison
 * over the column is a chronological one — correct for ordering, and it
 * leaves the string saying nothing about where the shop was. Reading the
 * day out of `2026-08-20T23:00:00.000Z` alone answers the 20th for a
 * receipt that printed the 21st, which is the whole defect this argument
 * exists to close.
 *
 * When it is null the timestamp's own suffix answers instead. That is not a
 * second source of truth: a producer that states the offset writes both
 * from the same fact, and one that states none is either spelling the
 * instant in UTC — where the suffix yields zero and the UTC day is the only
 * day anybody can name — or spelling an offset, which is then the best
 * evidence there is.
 *
 * Arithmetic on the epoch rather than string surgery, so an offset that
 * pushes the local time past midnight in either direction lands on the
 * right day.
 */
export function calendarDayOf(timestamp: string, offsetMinutes: number | null): string {
  const instant = Date.parse(timestamp);
  if (Number.isNaN(instant)) {
    throw new Error(`[bfm-api] not an ISO-8601 timestamp: ${timestamp}`);
  }
  const applied = offsetMinutes ?? readOffsetMinutes(timestamp);
  return new Date(instant + applied * 60_000).toISOString().slice(0, 10);
}

/**
 * Minutes east of UTC, from the timestamp's own suffix.
 *
 * `Z` is zero. Anything else the schema admits ends in `±HH:MM`. A string
 * that is neither never reaches here — `OrderedAtSchema` rejects it before
 * the mapping runs — and the throw is what keeps that true rather than
 * defaulting a malformed value to UTC and dating it silently wrong.
 */
function readOffsetMinutes(timestamp: string): number {
  if (timestamp.endsWith('Z') || timestamp.endsWith('z')) return 0;
  const match = /(?<sign>[+-])(?<hours>\d{2}):(?<minutes>\d{2})$/u.exec(timestamp);
  const groups = match?.groups;
  if (groups === undefined) {
    throw new Error(`[bfm-api] timestamp carries no UTC offset: ${timestamp}`);
  }
  const magnitude = Number(groups['hours']) * 60 + Number(groups['minutes']);
  return groups['sign'] === '-' ? -magnitude : magnitude;
}

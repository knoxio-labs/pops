/**
 * Turning a receipt's wall clock into an instant.
 *
 * Receipts print local time with no zone. Treating that as UTC misplaces
 * every purchase by however far the shop is from Greenwich — for Sydney,
 * ten or eleven hours, which silently moves an evening shop into the next
 * day and a month-end one into the next month.
 *
 * The offset is derived per timestamp rather than hardcoded, because
 * Sydney's is +10:00 for part of the year and +11:00 for the rest, and a
 * fixed guess is wrong for roughly half a year of history.
 *
 * Shared: the Everyday Rewards adapter reads it out of a POS footer, and
 * the drop-zone reads it off a photograph. Both then face the same problem.
 */

/**
 * Where the shops are.
 *
 * A single zone rather than one per receipt, because a photographed receipt
 * carries no zone and nothing else in the payload implies one. It is
 * configurable for the traveller case, and being wrong about it costs at
 * most a day's placement — where treating local time as UTC costs that on
 * every receipt.
 */
export function storeTimeZone(): string {
  const override = process.env['PURCHASES_TIME_ZONE'];
  return override === undefined || override === '' ? 'Australia/Sydney' : override;
}

/**
 * Minutes the zone was ahead of UTC at `instant`.
 *
 * `longOffset` yields `GMT+10:00` / `GMT+11:00`; `GMT` alone appears for
 * zones sitting exactly on UTC and is read as zero rather than as a failure.
 */
function zoneOffsetMinutes(instant: Date, timeZone: string): number | null {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value;
  if (name === undefined) return null;
  if (name === 'GMT') return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(name);
  if (match === null) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

export interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/**
 * Resolve a local wall-clock reading to an ISO-8601 instant, or null when
 * the reading is not a real moment.
 *
 * The offset depends on the instant and the instant depends on the offset.
 * One correction settles it everywhere except inside a DST transition:
 * guess with the offset in force at the naive UTC reading, then re-derive
 * with the offset actually in force at the resulting instant.
 */
export function instantFromLocalParts(
  parts: LocalParts,
  timeZone = storeTimeZone()
): string | null {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);

  // `Date.UTC` normalises rather than rejects: month 13 becomes January of
  // the next year, 31 February becomes 3 March, hour 25 becomes tomorrow.
  // A garbled reading would yield a confident, wrong date. Refusing
  // anything the round-trip does not reproduce catches all of it, including
  // 31 February, without a table of month lengths.
  const roundTrip = new Date(naive);
  if (
    roundTrip.getUTCFullYear() !== parts.year ||
    roundTrip.getUTCMonth() !== parts.month - 1 ||
    roundTrip.getUTCDate() !== parts.day ||
    roundTrip.getUTCHours() !== parts.hour ||
    roundTrip.getUTCMinutes() !== parts.minute
  ) {
    return null;
  }

  const firstGuess = zoneOffsetMinutes(roundTrip, timeZone);
  if (firstGuess === null) return null;
  const corrected = zoneOffsetMinutes(new Date(naive - firstGuess * 60_000), timeZone);
  if (corrected === null) return null;
  return new Date(naive - corrected * 60_000).toISOString();
}

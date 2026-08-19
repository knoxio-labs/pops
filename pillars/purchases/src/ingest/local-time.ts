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
 * Is this a zone the runtime actually knows?
 *
 * The receipt's zone is the one field a model is asked to infer, so it can
 * come back as a plausible-looking string that names nothing — a city with
 * no zone of its own, or a region invented to fit. Checked against the
 * runtime rather than a list, so aliases like `Australia/Canberra` (a real
 * link to `Australia/Sydney`) are accepted while inventions are not, and a
 * bad guess falls back to the default instead of throwing inside a date
 * calculation.
 */
export function isKnownTimeZone(zone: string | null | undefined): zone is string {
  if (zone === null || zone === undefined || zone === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
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
  /**
   * Optional because a receipt prints minutes at best. A camera writes
   * seconds, and truncating them would claim a precision the file did not
   * have to lose.
   */
  readonly second?: number;
}

/**
 * The reading as if it were UTC, or null when it is not a real moment.
 *
 * `Date.UTC` normalises rather than rejects: month 13 becomes January of
 * the next year, 31 February becomes 3 March, hour 25 becomes tomorrow. A
 * garbled reading would yield a confident, wrong date. Refusing anything
 * the round-trip does not reproduce catches all of it, including 31
 * February, without a table of month lengths.
 */
function naiveUtcOf(parts: LocalParts): number | null {
  const second = parts.second ?? 0;
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second);
  const roundTrip = new Date(naive);
  if (
    roundTrip.getUTCFullYear() !== parts.year ||
    roundTrip.getUTCMonth() !== parts.month - 1 ||
    roundTrip.getUTCDate() !== parts.day ||
    roundTrip.getUTCHours() !== parts.hour ||
    roundTrip.getUTCMinutes() !== parts.minute ||
    roundTrip.getUTCSeconds() !== second
  ) {
    return null;
  }
  return naive;
}

/**
 * The largest offset any real zone has ever used, either side of UTC.
 *
 * A guard rather than a lookup: nothing legitimate exceeds ±14:00, so a
 * larger figure is a garbled EXIF field or a client sending nonsense, and
 * applying it would move a purchase across a day boundary.
 */
const MAX_UTC_OFFSET_MINUTES = 14 * 60;

function isPlausibleUtcOffsetMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && Math.abs(minutes) <= MAX_UTC_OFFSET_MINUTES;
}

/**
 * Resolve a local wall-clock reading against a KNOWN offset rather than a
 * zone, or null when the reading is not a real moment.
 *
 * A camera writes `OffsetTimeOriginal`, and a device sends an ISO instant
 * carrying its own offset — both state the offset that was in force and
 * neither names a zone. That is enough to place the reading in time and is
 * not enough to place it in a zone, so the two are separate functions: this
 * one has no DST rule to apply and needs none.
 */
export function instantFromLocalPartsAtOffset(
  parts: LocalParts,
  offsetMinutes: number
): string | null {
  if (!isPlausibleUtcOffsetMinutes(offsetMinutes)) return null;
  const naive = naiveUtcOf(parts);
  if (naive === null) return null;
  return new Date(naive - offsetMinutes * 60_000).toISOString();
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
  const naive = naiveUtcOf(parts);
  if (naive === null) return null;

  const firstGuess = zoneOffsetMinutes(new Date(naive), timeZone);
  if (firstGuess === null) return null;
  const corrected = zoneOffsetMinutes(new Date(naive - firstGuess * 60_000), timeZone);
  if (corrected === null) return null;
  return new Date(naive - corrected * 60_000).toISOString();
}

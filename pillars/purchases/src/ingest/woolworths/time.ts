/**
 * Turning a till receipt's wall clock into an instant.
 *
 * The receipt footer states `POS 066 TRANS 3184 20:39 24/07/2026` — local
 * time, no zone, day-first. Treating that as UTC would misplace every
 * purchase by ten or eleven hours, which silently moves an evening shop
 * into the next day and, for anything after 1pm on the last day of a month,
 * into the next month.
 *
 * The offset is derived per timestamp rather than hardcoded, because
 * Sydney's is +10:00 for part of the year and +11:00 for the rest, and a
 * fixed guess is wrong for roughly half a year of history.
 */

const STORE_TIME_ZONE = 'Australia/Sydney';

/** `POS 066 TRANS 3184 20:39 24/07/2026` */
const TRANSACTION_DETAILS_RE =
  /POS\s+(\S+)\s+TRANS\s+(\S+)\s+(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/iu;

export interface TransactionStamp {
  readonly pos: string;
  readonly transaction: string;
  /** ISO-8601 instant, offset resolved for the store's zone. */
  readonly occurredAt: string;
  /** `DDMMYYYY`, as the receipt prints it — part of the natural key. */
  readonly localDate: string;
}

const OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: STORE_TIME_ZONE,
  timeZoneName: 'longOffset',
});

/**
 * Minutes that {@link STORE_TIME_ZONE} was ahead of UTC at `instant`.
 *
 * `longOffset` yields `GMT+10:00` / `GMT+11:00`; `GMT` alone appears for
 * zones sitting exactly on UTC and is read as zero rather than as a failure.
 */
function zoneOffsetMinutes(instant: Date): number | null {
  const name = OFFSET_FORMAT.formatToParts(instant).find((p) => p.type === 'timeZoneName')?.value;
  if (name === undefined) return null;
  if (name === 'GMT') return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(name);
  if (match === null) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/**
 * Resolve a local wall-clock reading to an instant.
 *
 * The offset depends on the instant, and the instant depends on the offset.
 * One correction settles it everywhere except inside a DST transition:
 * guess with the offset in force at the naive UTC reading, then re-derive
 * with the offset actually in force at the resulting instant.
 */
function instantFromLocalParts(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): string | null {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  // `Date.UTC` normalises rather than rejects: month 13 becomes January of
  // the next year, 31 February becomes 3 March, hour 25 becomes tomorrow.
  // A garbled footer would yield a confident, wrong date. Rejecting
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

  const firstGuess = zoneOffsetMinutes(new Date(naive));
  if (firstGuess === null) return null;
  const corrected = zoneOffsetMinutes(new Date(naive - firstGuess * 60_000));
  if (corrected === null) return null;
  return new Date(naive - corrected * 60_000).toISOString();
}

/**
 * Read the footer's transaction line.
 *
 * Returns null rather than a partial reading: `occurredAt` is what the
 * reconciliation window is measured against and the POS/TRANS pair is what
 * identifies the purchase, so a receipt missing either cannot be ingested
 * usefully anyway.
 */
export function readTransactionDetails(raw: string | null | undefined): TransactionStamp | null {
  const match = TRANSACTION_DETAILS_RE.exec(raw ?? '');
  if (match === null) return null;
  const [, pos = '', transaction = '', hour = '', minute = '', day = '', month = '', year = ''] =
    match;

  const occurredAt = instantFromLocalParts({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
  });
  if (occurredAt === null) return null;

  return {
    pos,
    transaction,
    occurredAt,
    localDate: `${day.padStart(2, '0')}${month.padStart(2, '0')}${year}`,
  };
}

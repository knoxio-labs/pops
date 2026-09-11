import { z } from 'zod';

/**
 * Money on the wire is an integer count of the minor unit. A float here
 * would silently break subset-sum in the reconciliation ladder, so the
 * schema rejects one rather than rounding it.
 */
export const CentsSchema = z.int();

/** Money that cannot be negative — component amounts, never a signed charge. */
export const NonNegativeCentsSchema = z.int().min(0);

/** ISO 4217. Uppercase three letters, so `aud` is a validation error, not a silent second currency. */
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, 'expected an ISO 4217 code');

const ISO_TIMESTAMP_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

export interface CalendarMoment {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/**
 * The naive UTC instant these fields name, or null when the round trip does
 * not reproduce them.
 *
 * `Date.UTC` normalises rather than rejects: 30 February becomes 2 March,
 * hour 25 becomes tomorrow, minute 60 becomes the next hour. A value that
 * merely overflows one field parses without error and is silently moved
 * into the next one, so the round-trip is the only way to catch it —
 * nothing downstream will, and there is no table of month lengths that
 * covers every field at once the way this does.
 *
 * Shared rather than reimplemented: the contract's own calendar check below
 * and `naiveUtcOf` in `src/ingest/local-time.ts`, which resolves a receipt's
 * local-time reading, both need exactly this test, and a second copy is one
 * that can silently stop agreeing with the first.
 */
export function naiveUtcMillis(parts: CalendarMoment): number | null {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const roundTrip = new Date(naive);
  if (
    roundTrip.getUTCFullYear() !== parts.year ||
    roundTrip.getUTCMonth() !== parts.month - 1 ||
    roundTrip.getUTCDate() !== parts.day ||
    roundTrip.getUTCHours() !== parts.hour ||
    roundTrip.getUTCMinutes() !== parts.minute ||
    roundTrip.getUTCSeconds() !== parts.second
  ) {
    return null;
  }
  return naive;
}

/**
 * Does this year/month/day name a day that exists?
 *
 * Exported because the Amazon ingest needs it a step earlier than this
 * schema runs: it parses a timestamp cell with `new Date` before anything
 * reaches the contract boundary, and by then `.toISOString()` has baked the
 * moved date in (POPS-3389).
 */
export function namesARealCalendarDay(year: number, month: number, day: number): boolean {
  return naiveUtcMillis({ year, month, day, hour: 0, minute: 0, second: 0 }) !== null;
}

/**
 * Does the calendar date this timestamp names actually exist, and does its
 * clock reading?
 *
 * The offset is not checked here: {@link ISO_TIMESTAMP_RE} already refuses
 * one outside `00:00`–`23:59` by shape, so a value reaching this point
 * always carries one the round-trip has no opinion on.
 *
 * Assumes `value` already matched {@link ISO_TIMESTAMP_RE}; called only
 * after the shape check has passed.
 */
function namesARealCalendarDate(value: string): boolean {
  const match = ISO_TIMESTAMP_RE.exec(value);
  if (match === null) return false;
  const [, year, month, day, hour, minute, second] = match;
  return (
    naiveUtcMillis({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second),
    }) !== null
  );
}

/**
 * An ISO-8601 timestamp carrying an explicit timezone.
 *
 * Enforced rather than merely documented, because the failure is silent:
 * `orderedAt` is what the reconciliation ladder's date window is measured
 * against, so a value the window cannot parse does not error — it simply
 * never matches, and the order sits in `awaiting_settlement` forever
 * looking like a purchase nobody paid for.
 *
 * The timezone is required for the same reason. A naive local timestamp
 * compared against a transaction date is ambiguous by up to a day, which
 * is a meaningful fraction of a 14–21 day matching window.
 *
 * The date and clock reading are checked for existing, not just for shape:
 * `2026-02-30` and `T24:00:00` have the right shape and name nothing.
 * `Date` parsing does not reject either — it rolls the first into March and
 * the second into tomorrow — so an order would land on the wrong day with
 * nothing recording that it was moved. The offset gets the same treatment
 * one level up, in the regex itself: `+24:00` and `+23:60` are refused by
 * shape rather than reaching a round-trip that has no fields of its own to
 * check them against.
 */
export const IsoTimestampSchema = z
  .string()
  .regex(
    ISO_TIMESTAMP_RE,
    'expected an ISO-8601 timestamp with a timezone, e.g. 2026-02-02T01:41:21Z'
  )
  .refine(namesARealCalendarDate, {
    message: 'does not name a real calendar date',
  });

/**
 * The widest offset any zone has ever been on, either side of UTC.
 *
 * The bound the `purchases` and `purchase_capture` columns CHECK, and the
 * one `src/ingest/local-time.ts` applies. A larger figure is a garbled
 * field rather than a place, and applying it moves an order across a day
 * boundary.
 */
const MAX_UTC_OFFSET_MINUTES = 14 * 60;

/**
 * Minutes ahead of UTC somewhere, as whole minutes.
 *
 * Whole minutes because no zone has ever used a finer resolution, and a
 * fractional value is a unit mistake — seconds or milliseconds arriving
 * where minutes were meant — which would place an order in the wrong
 * century rather than merely the wrong place.
 */
export const UtcOffsetMinutesSchema = z
  .int()
  .min(-MAX_UTC_OFFSET_MINUTES)
  .max(MAX_UTC_OFFSET_MINUTES);

/**
 * A soft cross-pillar reference: `pops://<pillar>/<type>/<id>`.
 *
 * These are resolved by a nightly cron and never at read time, so a
 * malformed one produces no error at ingest and no error on read — it just
 * never resolves, and the link to `finance`, `inventory` or `documents`
 * quietly stays broken. Validating the shape at the boundary is the only
 * place the mistake is cheap to catch.
 */
export const PopsUriSchema = z
  .string()
  .regex(
    /^pops:\/\/[a-z0-9-]+\/[a-z0-9-]+\/[^/\s]+$/u,
    'expected a pops:// URI, e.g. pops://finance/transaction/<id>'
  );

/**
 * One `pops://<pillar>/<type>/<id>` shape, matched and built from the same
 * place.
 *
 * Every narrower URI in this pillar — a finance transaction on the way in,
 * an inventory item on the way out — is the generic shape with two segments
 * pinned. Written out per site, the validator and the builder for the same
 * shape drift apart without anything failing: a URI that passes one and not
 * the other is stored, and the column it lands in is only ever resolved by
 * a nightly cron that reports the mismatch as a broken link months later.
 *
 * The id is a capture group, so the same pattern that validates a URI also
 * reads the id back out of it.
 */
export function popsUriPattern(pillar: string, type: string): RegExp {
  return new RegExp(`^pops://${pillar}/${type}/([^/\\s]+)$`, 'u');
}

/** The URI addressing one row on another pillar. Mirror of {@link popsUriPattern}. */
export function popsUri(pillar: string, type: string, id: string): string {
  return `pops://${pillar}/${type}/${id}`;
}

/** Matches a `pops://finance/transaction/<id>` URI, capturing the id. */
export const FINANCE_TRANSACTION_URI = popsUriPattern('finance', 'transaction');

/**
 * A `pops://finance/transaction/<id>` reference specifically.
 *
 * Narrower than {@link PopsUriSchema}, and deliberately narrower than the
 * stored column, which stays generic. It exists for the places a URI is an
 * INPUT: a lookup keyed on a well-formed URI from another pillar matches no
 * link and returns an empty answer, which reads as "no order bought this"
 * rather than "you asked the wrong question".
 */
export const FinanceTransactionUriSchema = z
  .string()
  .regex(
    FINANCE_TRANSACTION_URI,
    'expected a finance transaction URI, e.g. pops://finance/transaction/<id>'
  );

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
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

/**
 * Does the calendar date this timestamp names actually exist?
 *
 * `Date.UTC` normalises rather than rejects: 30 February becomes 2 March,
 * so a value that merely overflows its month parses without error and is
 * silently moved into the next one. The round-trip check is the same one
 * `naiveUtcOf` in `src/ingest/local-time.ts` already makes for receipt
 * readings, for the same reason — refusing the value is the only way to
 * catch it, since nothing downstream will.
 *
 * Assumes `value` already matched {@link ISO_TIMESTAMP_RE}; called only
 * after the shape check has passed.
 */
function namesARealCalendarDate(value: string): boolean {
  const match = ISO_TIMESTAMP_RE.exec(value);
  if (match === null) return false;
  const [, year, month, day, hour, minute, second] = match;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);
  const s = Number(second);
  const roundTrip = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return (
    roundTrip.getUTCFullYear() === y &&
    roundTrip.getUTCMonth() === mo - 1 &&
    roundTrip.getUTCDate() === d &&
    roundTrip.getUTCHours() === h &&
    roundTrip.getUTCMinutes() === mi &&
    roundTrip.getUTCSeconds() === s
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
 * The date is checked for existing, not just for shape: `2026-02-30` has
 * the right shape and names nothing. `Date` parsing does not reject it, it
 * rolls it into March, so an order would land in the wrong month with
 * nothing recording that it was moved.
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
    /^pops:\/\/finance\/transaction\/[^/\s]+$/u,
    'expected a finance transaction URI, e.g. pops://finance/transaction/<id>'
  );

/**
 * The scalar shapes every purchases schema is built out of.
 *
 * Split from `purchase.ts` because they are the vocabulary rather than the
 * records: money, currency, an instant, a cross-pillar reference. Each one
 * carries a constraint that is a decision — see its own comment — and none of
 * them mentions a purchase.
 *
 * Re-exported from `purchase.ts`, so importing either path resolves the same
 * schema and no consumer had to move.
 */
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
 */
export const IsoTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/u,
    'expected an ISO-8601 timestamp with a timezone, e.g. 2026-02-02T01:41:21Z'
  );

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

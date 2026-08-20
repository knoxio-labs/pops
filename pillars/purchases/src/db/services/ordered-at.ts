/**
 * One written form for `purchases.ordered_at`, and the window a bound on it
 * denotes.
 *
 * The column is TEXT, so every comparison the pillar makes on it — the SQL
 * `>=`/`<=` a date window becomes, the `ORDER BY ordered_at DESC` the index
 * and the queue read through, the equality the shop-moment dedup turns on —
 * is lexicographic. String order equals chronological order only while every
 * value is spelled the same way, and `IsoTimestampSchema` does not require
 * that: it admits an offset and optional fractional seconds. Two spellings
 * of one instant then sort apart, and two instants sort backwards:
 * `2026-01-01T10:00:00+10:00` names midnight UTC and sorts after every
 * `2026-01-01T0…Z`, and `…21.500Z` sorts before `…21Z` because `.` precedes
 * `Z`. Sydney is UTC+10/+11, so the offset spelling is the one a local
 * caller writes by hand.
 *
 * The fix is on the write side rather than the read side. Wrapping the SQL
 * predicate in `datetime()` corrects that predicate and nothing else: the
 * orderings, the equality and the in-memory folds keep comparing text, and
 * the wrap is non-sargable, so the linker's `(source, ordered_at)` index
 * stops being usable for exactly the query it exists for. Canonicalising
 * once, where the value enters, makes the assumption every reader already
 * holds a true one — including in the readers nobody enumerated.
 *
 * The canonical form is `YYYY-MM-DDTHH:MM:SS.sssZ`, which is what
 * `toISOString()` and the `strftime('%Y-%m-%dT%H:%M:%fZ', …)` column
 * defaults both produce, so it is already the form of every row the shipped
 * adapters wrote. Fixed-width and UTC are both load-bearing: the offset is
 * what makes two instants sort backwards, and the fixed three fractional
 * digits are what stops `…21Z` and `…21.500Z` sorting apart. Precision below
 * a millisecond is dropped, which is the precision the whole pillar keeps —
 * `nowIso()` and the column defaults have no more.
 *
 * A value that names no instant is refused wherever it appears rather than
 * compared: at ingest by `createPurchase`, on the wire by the readers of a
 * window bound, and here by {@link orderedAtWindow} for anything that got
 * past them. A bound handed to SQL unread is a text comparison against
 * canonical rows, which answers `200` over a window nobody asked for.
 */
import { gte, lte } from 'drizzle-orm';

import { IsoTimestampSchema } from '../../contract/schemas/purchase.js';
import { purchases } from '../schema.js';

import type { SQL } from 'drizzle-orm';

/**
 * The instant a timestamp names, spelled the one way, or null when it names
 * no instant at all.
 *
 * The shape is checked before the value is parsed, so what is accepted here
 * is what the contract accepts and no more. `new Date` is wider than that in
 * a way that matters: it resolves a naive `2026-02-02T01:41:21` against the
 * host's timezone, which would make the stored instant depend on where the
 * process runs — the misplacement `src/ingest/local-time.ts` exists to
 * prevent, arrived at from the other end.
 *
 * Out-of-range fields (`2026-13-01`, `+99:00`) name nothing and yield null.
 * An overflowing day (`2026-02-30`) does not: it rolls into March, which is
 * what `Date.parse` has always done for the folds and what SQLite's own
 * date functions do for the migration that rewrites stored rows, so the two
 * agree rather than disagreeing quietly.
 */
export function canonicalInstant(value: string): string | null {
  if (!IsoTimestampSchema.safeParse(value).success) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/**
 * A window bound that names no instant, refused rather than compared.
 *
 * Every route that takes a window off the wire reads its bounds first and
 * answers `400`, so reaching this is a caller that did not: an internal
 * sweep, a script, a future route that forgot. Loud there beats a plausible
 * list built from a predicate nobody could have meant.
 */
export class UnreadableOrderedAtBoundError extends Error {
  readonly value: string;

  constructor(value: string) {
    super(`ordered_at bound '${value}' names no instant`);
    this.name = 'UnreadableOrderedAtBoundError';
    this.value = value;
  }
}

function canonicalBound(value: string): string {
  const bound = canonicalInstant(value);
  if (bound === null) throw new UnreadableOrderedAtBoundError(value);
  return bound;
}

/** Inclusive bounds on `orderedAt`, in whatever ISO-8601 form the caller wrote them. */
export interface OrderedAtBounds {
  readonly from?: string;
  readonly to?: string;
}

/**
 * The `ordered_at` predicates a pair of bounds denotes.
 *
 * Shared rather than spelled per query so that a scoped read and the
 * reconcile sweep cover the same rows for the same window — two copies of
 * `gte`/`lte` agree only by inspection, and the first correction to either
 * leaves the other behind.
 *
 * Throws {@link UnreadableOrderedAtBoundError} for a bound naming no
 * instant, rather than comparing it as text.
 */
export function orderedAtWindow(bounds: OrderedAtBounds): readonly SQL[] {
  return [
    ...(bounds.from === undefined ? [] : [gte(purchases.orderedAt, canonicalBound(bounds.from))]),
    ...(bounds.to === undefined ? [] : [lte(purchases.orderedAt, canonicalBound(bounds.to))]),
  ];
}

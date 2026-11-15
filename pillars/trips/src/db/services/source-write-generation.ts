import { and, eq, isNull } from 'drizzle-orm';

import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { TripsDb } from '../index.js';
import type { events, journeys, stays } from '../schema.js';

/** Guard and advance a live source's private write generation inside the caller's immediate transaction. */
export function nextSourceWriteGeneration(
  db: TripsDb,
  table: typeof events | typeof journeys | typeof stays,
  tripId: number,
  id: number
): number {
  const current = requireOwnedRecord(
    db
      .select({ generation: table.removalRevision })
      .from(table)
      .where(and(eq(table.tripId, tripId), eq(table.id, id), isNull(table.removedAt)))
      .get()
  );
  if (
    !Number.isSafeInteger(current.generation) ||
    current.generation < 0 ||
    current.generation >= Number.MAX_SAFE_INTEGER
  )
    throw new TripsServiceError('source_revision_conflict');
  return current.generation + 1;
}

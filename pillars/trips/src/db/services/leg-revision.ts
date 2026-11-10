import { eq } from 'drizzle-orm';

import { journeys } from '../schema.js';
import { getJourney } from './journeys.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { TripsDb } from '../index.js';

/** Read a leg-set revision through its live owning trip and journey inside the caller's transaction. */
export function requireLegRevision(
  db: TripsDb,
  identity: { tripId: number; journeyId: number },
  expectedRevision?: number
): number {
  getJourney(db, identity.tripId, identity.journeyId);
  const { legRevision } = requireOwnedRecord(
    db
      .select({ legRevision: journeys.legRevision })
      .from(journeys)
      .where(eq(journeys.id, identity.journeyId))
      .get()
  );
  if (expectedRevision !== undefined && expectedRevision !== legRevision)
    throw new TripsServiceError('leg_revision_conflict');
  return legRevision;
}
/** Refuse exhausted JSON/JavaScript safe-integer revisions before changing any source facts. */
export function assertLegRevisionWritable(revision: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
    throw new TripsServiceError('leg_revision_conflict');
}
/** Read and guard a revision for a new write; replay-only reads remain valid at the numeric boundary. */
export function requireWritableLegRevision(
  db: TripsDb,
  identity: { tripId: number; journeyId: number },
  expectedRevision?: number
): number {
  const revision = requireLegRevision(db, identity, expectedRevision);
  assertLegRevisionWritable(revision);
  return revision;
}
/** Advance a previously checked collection exactly once without changing source metadata timestamps. */
export function advanceLegRevision(db: TripsDb, journeyId: number, revision: number): number {
  assertLegRevisionWritable(revision);
  db.update(journeys)
    .set({ legRevision: revision + 1 })
    .where(eq(journeys.id, journeyId))
    .run();
  return revision + 1;
}

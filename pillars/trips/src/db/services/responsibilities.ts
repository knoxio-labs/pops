import { and, asc, eq } from 'drizzle-orm';

import { ArrangementResponsibilitySchema } from '../../contract/responsibilities.js';
import { arrangementResponsibilities } from '../schema.js';
import { requireArrangementRevision } from './arrangement-revision.js';
import { getEvent } from './events.js';
import { getJourney } from './journeys.js';
import { getTrip } from './records.js';
import { getRental } from './rentals.js';
import { requireOwnedRecord } from './source-record.js';
import { getStay } from './stays.js';

import type {
  ArrangementResponsibility,
  Responsibility,
  ResponsibilityTargetKind,
} from '../../contract/responsibilities.js';
import type { TripsDb } from '../index.js';

function requireTarget(
  db: TripsDb,
  tripId: number,
  kind: ResponsibilityTargetKind,
  id: number
): void {
  switch (kind) {
    case 'journey':
      getJourney(db, tripId, id);
      break;
    case 'stay':
      getStay(db, tripId, id);
      break;
    case 'event':
      getEvent(db, tripId, id);
      break;
    case 'rental':
      getRental(db, tripId, id);
      break;
  }
}
function targetWhere(
  tripId: number,
  kind: ResponsibilityTargetKind,
  id: number
): ReturnType<typeof and> {
  return and(
    eq(arrangementResponsibilities.tripId, tripId),
    eq(arrangementResponsibilities.targetKind, kind),
    eq(arrangementResponsibilities.targetId, id)
  );
}
/** Read explicit records, including cleared revision tombstones, without contacting Contacts. */
export function listResponsibilities(db: TripsDb, tripId: number): ArrangementResponsibility[] {
  getTrip(db, tripId);
  return db
    .select()
    .from(arrangementResponsibilities)
    .where(eq(arrangementResponsibilities.tripId, tripId))
    .orderBy(asc(arrangementResponsibilities.id))
    .all()
    .map((row) => ArrangementResponsibilitySchema.parse(row));
}
/** Read one same-trip target; untouched associations are unset at revision zero. */
export function getResponsibility(
  db: TripsDb,
  tripId: number,
  targetKind: ResponsibilityTargetKind,
  targetId: number
): ArrangementResponsibility {
  return db.transaction((tx) => {
    requireTarget(tx, tripId, targetKind, targetId);
    const row = tx
      .select()
      .from(arrangementResponsibilities)
      .where(targetWhere(tripId, targetKind, targetId))
      .get();
    return ArrangementResponsibilitySchema.parse(
      row ?? { tripId, targetKind, targetId, responsibility: null, revision: 0 }
    );
  });
}
/** Replace or clear the whole association at a matching revision; unresolved identities remain valid. */
export function replaceResponsibility(
  db: TripsDb,
  tripId: number,
  target: { kind: ResponsibilityTargetKind; id: number },
  input: { expectedRevision: number; responsibility: Responsibility }
): ArrangementResponsibility {
  const { kind: targetKind, id: targetId } = target;
  const { expectedRevision, responsibility } = input;
  return db.transaction(
    (tx) => {
      const current = getResponsibility(tx, tripId, targetKind, targetId);
      requireArrangementRevision(current.revision, expectedRevision);
      const row = tx
        .insert(arrangementResponsibilities)
        .values({ tripId, targetKind, targetId, responsibility, revision: expectedRevision + 1 })
        .onConflictDoUpdate({
          target: [
            arrangementResponsibilities.tripId,
            arrangementResponsibilities.targetKind,
            arrangementResponsibilities.targetId,
          ],
          set: { responsibility, revision: expectedRevision + 1 },
        })
        .returning()
        .get();
      return ArrangementResponsibilitySchema.parse(requireOwnedRecord(row));
    },
    { behavior: 'immediate' }
  );
}

import { isDeepStrictEqual } from 'node:util';

import { and, asc, eq } from 'drizzle-orm';

import { MeetingPlanSchema } from '../../contract/meeting-plan-schemas.js';
import { meetingPlanOperations, meetingPlans } from '../schema.js';
import { getTrip } from './records.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type {
  MeetingPlan,
  MeetingPlanOperation,
  MeetingPlanOperationResult,
} from '../../contract/meeting-plan-schemas.js';
import type { TripsDb } from '../index.js';

/** Read a meeting source, including its tombstone, through its owning trip. */
export function readMeetingPlan(db: TripsDb, tripId: number, id: number): MeetingPlan {
  return MeetingPlanSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(meetingPlans)
        .where(and(eq(meetingPlans.tripId, tripId), eq(meetingPlans.id, id)))
        .get()
    )
  );
}
/** Read an active source; removed plans remain available only through their operation receipts. */
export function getMeetingPlan(db: TripsDb, tripId: number, id: number): MeetingPlan {
  const plan = readMeetingPlan(db, tripId, id);
  if (plan.removed) throw new TripsServiceError('not_found');
  return plan;
}
/** Read active plans in identity order; grouping never guesses a Visit from a place name. */
export function listMeetingPlans(db: TripsDb, tripId: number): MeetingPlan[] {
  getTrip(db, tripId);
  return db
    .select()
    .from(meetingPlans)
    .where(and(eq(meetingPlans.tripId, tripId), eq(meetingPlans.removed, false)))
    .orderBy(asc(meetingPlans.id))
    .all()
    .map((row) => MeetingPlanSchema.parse(row));
}
/** Look up one trip-owned operation without consulting external sources. */
export function findMeetingPlanOperation(
  db: TripsDb,
  tripId: number,
  operationId: string
): typeof meetingPlanOperations.$inferSelect | undefined {
  return db
    .select()
    .from(meetingPlanOperations)
    .where(
      and(
        eq(meetingPlanOperations.tripId, tripId),
        eq(meetingPlanOperations.operationId, operationId)
      )
    )
    .get();
}
/** Replay an identical request's historical outcome alongside current facts; mismatched UUID reuse never writes. */
export function replayMeetingPlanOperation(
  db: TripsDb,
  tripId: number,
  operation: MeetingPlanOperation
): MeetingPlanOperationResult | undefined {
  const prior = findMeetingPlanOperation(db, tripId, operation.operationId);
  if (prior === undefined) return undefined;
  if (!isDeepStrictEqual(prior.request, operation))
    throw new TripsServiceError('meeting_operation_mismatch');
  return {
    receipt: prior.receipt,
    current: readMeetingPlan(db, tripId, prior.receipt.after.id),
    undone: prior.undoneBy !== null,
    replayed: true,
  };
}
/** Require a writable exact revision; JavaScript's safe integer bound prevents loss of CAS identity. */
export function requireMeetingRevision(plan: MeetingPlan, expected: number): void {
  if (plan.revision !== expected) throw new TripsServiceError('meeting_revision_conflict');
  if (!Number.isSafeInteger(plan.revision) || plan.revision >= Number.MAX_SAFE_INTEGER)
    throw new TripsServiceError('meeting_revision_exhausted');
}

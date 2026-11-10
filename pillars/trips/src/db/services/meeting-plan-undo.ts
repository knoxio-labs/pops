import { isDeepStrictEqual } from 'node:util';

import { and, eq, isNull } from 'drizzle-orm';

import { MeetingPlanSchema } from '../../contract/meeting-plan-schemas.js';
import { meetingPlanOperations, meetingPlans } from '../schema.js';
import {
  findMeetingPlanOperation,
  readMeetingPlan,
  requireMeetingRevision,
} from './meeting-plan-queries.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { MeetingPlan, MeetingPlanReceipt } from '../../contract/meeting-plan-schemas.js';
import type { TripsDb } from '../index.js';

function acknowledgePredecessor(
  db: TripsDb,
  tripId: number,
  before: MeetingPlan | null,
  after: MeetingPlan
): void {
  if (before === null) return;
  const candidates = db
    .select()
    .from(meetingPlanOperations)
    .where(and(eq(meetingPlanOperations.tripId, tripId), isNull(meetingPlanOperations.undoneBy)))
    .all()
    .filter(
      (entry) =>
        entry.request.command.kind !== 'undo' && isDeepStrictEqual(entry.expectedAfter, before)
    );
  if (candidates.length > 1) throw new TripsServiceError('meeting_undo_conflict');
  const predecessor = candidates[0];
  if (predecessor !== undefined)
    db.update(meetingPlanOperations)
      .set({ expectedAfter: after })
      .where(eq(meetingPlanOperations.id, predecessor.id))
      .run();
}
/** Undo only the untouched confirmed outcome; rebase only a proven predecessor after restoring its exact source. */
export function undoMeetingPlanOperation(
  db: TripsDb,
  tripId: number,
  operationId: string,
  targetOperationId: string
): MeetingPlanReceipt {
  const prior = findMeetingPlanOperation(db, tripId, targetOperationId);
  if (prior === undefined || prior.undoneBy !== null || prior.request.command.kind === 'undo')
    throw new TripsServiceError('meeting_undo_conflict');
  const current = readMeetingPlan(db, tripId, prior.receipt.after.id);
  if (!isDeepStrictEqual(current, prior.expectedAfter))
    throw new TripsServiceError('meeting_undo_conflict');
  requireMeetingRevision(current, prior.expectedAfter.revision);
  const restored = prior.receipt.before ?? { ...current, removed: true };
  const after = MeetingPlanSchema.parse(
    requireOwnedRecord(
      db
        .update(meetingPlans)
        .set({ ...restored, revision: current.revision + 1, updatedAt: new Date().toISOString() })
        .where(and(eq(meetingPlans.id, current.id), eq(meetingPlans.tripId, tripId)))
        .returning()
        .get()
    )
  );
  db.update(meetingPlanOperations)
    .set({ undoneBy: operationId })
    .where(eq(meetingPlanOperations.id, prior.id))
    .run();
  acknowledgePredecessor(db, tripId, prior.receipt.before, after);
  return { operationId, undoneOperationId: targetOperationId, before: current, after };
}

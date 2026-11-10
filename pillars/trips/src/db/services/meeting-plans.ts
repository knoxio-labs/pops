import { and, eq } from 'drizzle-orm';

import {
  MeetingContactUriSchema,
  MeetingPlanOperationSchema,
  MeetingPlanSchema,
} from '../../contract/meeting-plan-schemas.js';
import { meetingPlanOperations, meetingPlans } from '../schema.js';
import {
  getMeetingPlan,
  replayMeetingPlanOperation,
  requireMeetingRevision,
} from './meeting-plan-queries.js';
import { undoMeetingPlanOperation } from './meeting-plan-undo.js';
import { getTrip, getVisit } from './records.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type {
  MeetingPlanOperation,
  MeetingPlanOperationResult,
  MeetingPlanPatch,
  MeetingPlanReceipt,
} from '../../contract/meeting-plan-schemas.js';
import type { TripsDb } from '../index.js';

interface Context {
  db: TripsDb;
  tripId: number;
  operation: MeetingPlanOperation;
  resolvedContactUri?: string;
}
function verifiedPatch(
  patch: MeetingPlanPatch,
  beforeUri: string | null,
  resolvedUri: string | undefined
): MeetingPlanPatch {
  if (patch.contactUri === undefined || patch.contactUri === null || patch.contactUri === beforeUri)
    return patch;
  if (resolvedUri === undefined) throw new TripsServiceError('meeting_contact_unavailable');
  return { ...patch, contactUri: MeetingContactUriSchema.parse(resolvedUri) };
}
function commandPatch(
  command: Exclude<MeetingPlanOperation['command'], { kind: 'undo' }>
): MeetingPlanPatch {
  if (command.kind === 'create') return command.input;
  if (command.kind === 'update') return command.patch;
  return {};
}
function applyCommand(context: Context): MeetingPlanReceipt {
  const { db, tripId, operation, resolvedContactUri } = context;
  const command = operation.command;
  if (command.kind === 'undo')
    return undoMeetingPlanOperation(db, tripId, operation.operationId, command.targetOperationId);
  const before = command.kind === 'create' ? null : getMeetingPlan(db, tripId, command.id);
  if (command.kind !== 'create' && before !== null)
    requireMeetingRevision(before, command.expectedRevision);
  const input = commandPatch(command);
  const patch = verifiedPatch(input, before?.contactUri ?? null, resolvedContactUri);
  if (patch.visitId !== undefined && patch.visitId !== null && patch.visitId !== before?.visitId)
    getVisit(db, tripId, patch.visitId);
  const row =
    before === null
      ? db
          .insert(meetingPlans)
          .values({ ...patch, tripId })
          .returning()
          .get()
      : db
          .update(meetingPlans)
          .set({
            ...patch,
            removed: command.kind === 'remove',
            revision: before.revision + 1,
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(meetingPlans.id, before.id), eq(meetingPlans.tripId, tripId)))
          .returning()
          .get();
  return {
    operationId: operation.operationId,
    undoneOperationId: null,
    before,
    after: MeetingPlanSchema.parse(requireOwnedRecord(row)),
  };
}
/** Apply or replay atomically. New Contact links require the owning API's resolved URI, supplied separately from immutable request identity. */
export function operateMeetingPlan(
  db: TripsDb,
  tripId: number,
  input: MeetingPlanOperation,
  resolvedContactUri?: string
): MeetingPlanOperationResult {
  const operation = MeetingPlanOperationSchema.parse(JSON.parse(JSON.stringify(input)));
  return db.transaction(
    (tx) => {
      getTrip(tx, tripId);
      const replay = replayMeetingPlanOperation(tx, tripId, operation);
      if (replay !== undefined) return replay;
      const receipt = applyCommand({
        db: tx,
        tripId,
        operation,
        ...(resolvedContactUri === undefined ? {} : { resolvedContactUri }),
      });
      tx.insert(meetingPlanOperations)
        .values({
          tripId,
          operationId: operation.operationId,
          request: operation,
          receipt,
          expectedAfter: receipt.after,
        })
        .run();
      return { receipt, current: receipt.after, undone: false, replayed: false };
    },
    { behavior: 'immediate' }
  );
}

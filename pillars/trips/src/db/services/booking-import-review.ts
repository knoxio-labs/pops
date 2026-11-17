import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { BookingReviewInputSchema } from '../../contract/booking-imports.js';
import { bookingImportDecisions } from '../schema.js';
import {
  bookingAttempt,
  bookingBinding,
  bookingDecision,
  bookingReplay,
  bookingSource,
  recordBookingRequest,
  requireBookingRevision,
} from './booking-import-records.js';
import { getCapture, requireSourceRevision } from './source-queries.js';
import { TripsServiceError } from './source-record.js';

import type { BookingDecision } from '../../contract/booking-import-values.js';
import type { BookingReviewInput } from '../../contract/booking-imports.js';
import type { TripsDb } from '../index.js';

interface BookingReviewResult {
  readonly decisions: BookingDecision[];
}

function validateReview(
  db: TripsDb,
  tripId: number,
  sourceId: string,
  input: BookingReviewInput
): void {
  const source = bookingSource(db, tripId, sourceId);
  const binding = bookingBinding(db, tripId, sourceId, input.bindingId);
  requireBookingRevision(source.revision, input.expectedSourceRevision);
  requireSourceRevision(
    getCapture(db, tripId, binding.selection.captureId),
    input.expectedCaptureRevision
  );
  const attempt = bookingAttempt(db, tripId, sourceId, input.attemptId);
  if (
    attempt.state !== 'succeeded' ||
    attempt.bindingId !== binding.id ||
    source.latestAttemptId !== attempt.id
  )
    throw new TripsServiceError('booking_import_conflict');
  const accepted = db
    .select()
    .from(bookingImportDecisions)
    .where(eq(bookingImportDecisions.sourceId, sourceId))
    .all()
    .some((row) => row.committedOperationId !== null);
  if (
    (input.admission === 'initial' && accepted) ||
    (input.admission === 'additional' && !accepted)
  )
    throw new TripsServiceError('booking_import_conflict');
  for (const decision of input.decisions) {
    if (
      new Set(decision.proposalIds).size !== decision.proposalIds.length ||
      decision.proposalIds.some((id) => !attempt.proposals.some((proposal) => proposal.id === id))
    )
      throw new TripsServiceError('booking_import_invalid');
    if ((input.admission === 'existing') !== (decision.target.mode === 'existing'))
      throw new TripsServiceError('booking_import_invalid');
  }
}
/** Store an immutable explicit batch without creating or modifying canonical bookings. */
export function reviewBookingSource(
  db: TripsDb,
  tripId: number,
  sourceId: string,
  input: BookingReviewInput
): BookingReviewResult {
  const parsed = BookingReviewInputSchema.parse(input);
  const request = { kind: 'review', sourceId, input: parsed };
  return db.transaction(
    (tx) => {
      const replay = bookingReplay(tx, tripId, parsed.operationId, request);
      if (replay?.kind === 'review')
        return {
          decisions: replay.decisionIds.map((id) => bookingDecision(tx, tripId, sourceId, id)),
        };
      validateReview(tx, tripId, sourceId, parsed);
      const decisionIds = parsed.decisions.map((decision) => {
        const id = randomUUID();
        tx.insert(bookingImportDecisions)
          .values({
            id,
            tripId,
            sourceId,
            bindingId: parsed.bindingId,
            expectedSourceRevision: parsed.expectedSourceRevision,
            expectedCaptureRevision: parsed.expectedCaptureRevision,
            admission: parsed.admission,
            attemptId: parsed.attemptId,
            proposalIds: decision.proposalIds,
            target: decision.target,
          })
          .run();
        return id;
      });
      recordBookingRequest({
        db: tx,
        tripId,
        sourceId,
        operationId: parsed.operationId,
        request,
        receipt: { kind: 'review', decisionIds },
      });
      return { decisions: decisionIds.map((id) => bookingDecision(tx, tripId, sourceId, id)) };
    },
    { behavior: 'immediate' }
  );
}

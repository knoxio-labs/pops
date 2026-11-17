import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { bookingImportAttempts, bookingImportSources } from '../schema.js';
import {
  bookingBinding,
  bookingReplay,
  bookingSource,
  recordBookingRequest,
  requireBookingRevision,
} from './booking-import-records.js';
import { getCapture, requireSourceRevision } from './source-queries.js';
import { TripsServiceError } from './source-record.js';

import type { BookingExtractInput } from '../../contract/booking-imports.js';
import type { TripsDb } from '../index.js';

/** The durable claim is either this operation's single dispatch or an exact replay. */
export type BookingAttemptClaim =
  | { readonly id: string; readonly claimed: false }
  | { readonly id: string; readonly claimed: true };

/** Atomically claim an extraction only after source, binding, and predecessor revisions match. */
export function claimBookingAttempt(
  db: TripsDb,
  tripId: number,
  sourceId: string,
  input: BookingExtractInput
): BookingAttemptClaim {
  const request = { kind: 'extract', sourceId, input };
  return db.transaction(
    (tx) => {
      const replay = bookingReplay(tx, tripId, input.operationId, request);
      if (replay?.kind === 'extract') return { id: replay.attemptId, claimed: false };
      const source = bookingSource(tx, tripId, sourceId);
      const binding = bookingBinding(tx, tripId, sourceId, input.bindingId);
      requireSourceRevision(
        getCapture(tx, tripId, binding.selection.captureId),
        binding.selection.expectedCaptureRevision
      );
      requireBookingRevision(source.revision, input.expectedSourceRevision);
      if (source.latestAttemptId !== input.predecessorId)
        throw new TripsServiceError('booking_import_conflict');
      const id = randomUUID();
      tx.insert(bookingImportAttempts)
        .values({
          id,
          tripId,
          sourceId,
          bindingId: input.bindingId,
          providerId: input.providerId,
          modelId: input.modelId,
          predecessorId: input.predecessorId,
          state: 'claimed',
        })
        .run();
      tx.update(bookingImportSources)
        .set({ latestAttemptId: id, revision: source.revision + 1 })
        .where(eq(bookingImportSources.id, sourceId))
        .run();
      recordBookingRequest({
        db: tx,
        tripId,
        sourceId,
        operationId: input.operationId,
        request,
        receipt: { kind: 'extract', attemptId: id },
      });
      return { id, claimed: true };
    },
    { behavior: 'immediate' }
  );
}

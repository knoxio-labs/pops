import { and, eq } from 'drizzle-orm';

import { BookingDecisionSchema } from '../../contract/booking-import-values.js';
import {
  BookingExtractionAttemptSchema,
  BookingImportSourceSchema,
  BookingSourceBindingSchema,
} from '../../contract/booking-imports.js';
import {
  bookingImportAttempts,
  bookingImportBindings,
  bookingImportDecisions,
  bookingImportRequests,
  bookingImportSources,
} from '../schema.js';
import { getTrip } from './records.js';
import { canonicalSourceValue } from './source-canonical.js';
import { requireOwnedRecord, TripsServiceError } from './source-record.js';

import type { BookingRequestReceipt } from '../../contract/booking-import-storage.js';
import type { BookingDecision } from '../../contract/booking-import-values.js';
import type {
  BookingExtractionAttempt,
  BookingImportSource,
  BookingSourceBinding,
} from '../../contract/booking-imports.js';
import type { TripsDb } from '../index.js';

interface RecordBookingRequestInput {
  readonly db: TripsDb;
  readonly tripId: number;
  readonly sourceId: string;
  readonly operationId: string;
  readonly request: unknown;
  readonly receipt: BookingRequestReceipt;
}

/** Require a verified source belonging to this Trip. */
export function bookingSource(db: TripsDb, tripId: number, sourceId: string): BookingImportSource {
  getTrip(db, tripId);
  return BookingImportSourceSchema.parse(
    requireOwnedRecord(
      db
        .select()
        .from(bookingImportSources)
        .where(and(eq(bookingImportSources.tripId, tripId), eq(bookingImportSources.id, sourceId)))
        .get()
    )
  );
}
/** Require an immutable binding to the selected source and Trip. */
export function bookingBinding(
  db: TripsDb,
  tripId: number,
  sourceId: string,
  id: string
): BookingSourceBinding {
  return BookingSourceBindingSchema.parse(
    requireOwnedRecord(
      db
        .select({
          id: bookingImportBindings.id,
          sourceId: bookingImportBindings.sourceId,
          selection: bookingImportBindings.selection,
          documentsOrigin: bookingImportBindings.documentsOrigin,
          mediaType: bookingImportBindings.mediaType,
          createdAt: bookingImportBindings.createdAt,
        })
        .from(bookingImportBindings)
        .where(
          and(
            eq(bookingImportBindings.tripId, tripId),
            eq(bookingImportBindings.sourceId, sourceId),
            eq(bookingImportBindings.id, id)
          )
        )
        .get()
    )
  );
}
/** Require an attempt without treating a crashed claimed invocation as safely retryable. */
export function bookingAttempt(
  db: TripsDb,
  tripId: number,
  sourceId: string,
  id: string
): BookingExtractionAttempt {
  const row = requireOwnedRecord(
    db
      .select({
        id: bookingImportAttempts.id,
        sourceId: bookingImportAttempts.sourceId,
        bindingId: bookingImportAttempts.bindingId,
        providerId: bookingImportAttempts.providerId,
        modelId: bookingImportAttempts.modelId,
        predecessorId: bookingImportAttempts.predecessorId,
        state: bookingImportAttempts.state,
        proposals: bookingImportAttempts.proposals,
        failure: bookingImportAttempts.failure,
        createdAt: bookingImportAttempts.createdAt,
        updatedAt: bookingImportAttempts.updatedAt,
      })
      .from(bookingImportAttempts)
      .where(
        and(
          eq(bookingImportAttempts.tripId, tripId),
          eq(bookingImportAttempts.sourceId, sourceId),
          eq(bookingImportAttempts.id, id)
        )
      )
      .get()
  );
  return BookingExtractionAttemptSchema.parse({
    ...row,
    state: row.state === 'claimed' ? 'outcome_unknown' : row.state,
  });
}
/** Require a reviewed occurrence in the exact source aggregate. */
export function bookingDecision(
  db: TripsDb,
  tripId: number,
  sourceId: string,
  id: string
): BookingDecision {
  return BookingDecisionSchema.parse(
    requireOwnedRecord(
      db
        .select({
          id: bookingImportDecisions.id,
          sourceId: bookingImportDecisions.sourceId,
          bindingId: bookingImportDecisions.bindingId,
          expectedSourceRevision: bookingImportDecisions.expectedSourceRevision,
          expectedCaptureRevision: bookingImportDecisions.expectedCaptureRevision,
          admission: bookingImportDecisions.admission,
          attemptId: bookingImportDecisions.attemptId,
          proposalIds: bookingImportDecisions.proposalIds,
          target: bookingImportDecisions.target,
          committedOperationId: bookingImportDecisions.committedOperationId,
          createdAt: bookingImportDecisions.createdAt,
        })
        .from(bookingImportDecisions)
        .where(
          and(
            eq(bookingImportDecisions.tripId, tripId),
            eq(bookingImportDecisions.sourceId, sourceId),
            eq(bookingImportDecisions.id, id)
          )
        )
        .get()
    )
  );
}
/** Resolve exact UUID replay before external reads or writes; changed input never reuses proof. */
export function bookingReplay(
  db: TripsDb,
  tripId: number,
  operationId: string,
  request: unknown
): BookingRequestReceipt | undefined {
  const existing = db
    .select()
    .from(bookingImportRequests)
    .where(
      and(
        eq(bookingImportRequests.tripId, tripId),
        eq(bookingImportRequests.operationId, operationId)
      )
    )
    .get();
  if (existing !== undefined && existing.canonicalRequest !== canonicalSourceValue(request))
    throw new TripsServiceError('booking_import_mismatch');
  return existing?.receipt;
}
/** Persist the exact request and its owning durable lookup in the caller's transaction. */
export function recordBookingRequest(input: RecordBookingRequestInput): void {
  const { db, tripId, sourceId, operationId, request, receipt } = input;
  db.insert(bookingImportRequests)
    .values({
      tripId,
      sourceId,
      operationId,
      canonicalRequest: canonicalSourceValue(request),
      receipt,
    })
    .run();
}
/** Require exact aggregate revision; accepted bindings cannot be bypassed with a fresh request UUID. */
export function requireBookingRevision(actual: number, expected: number): void {
  if (actual !== expected || actual >= Number.MAX_SAFE_INTEGER)
    throw new TripsServiceError('booking_import_conflict');
}

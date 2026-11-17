import { and, asc, eq } from 'drizzle-orm';

import { BookingDecisionSchema } from '../../contract/booking-import-values.js';
import {
  BookingImportSnapshotSchema,
  BookingSourceBindingSchema,
} from '../../contract/booking-imports.js';
import {
  bookingImportAttempts,
  bookingImportBindings,
  bookingImportDecisions,
  bookingImportRequests,
} from '../schema.js';
import { bookingAttempt, bookingSource } from './booking-import-records.js';
import { readSourceOperation } from './source-operations.js';
import { TripsServiceError } from './source-record.js';

import type { BookingImportSnapshot } from '../../contract/booking-imports.js';
import type { TripsDb } from '../index.js';

function listBindings(db: TripsDb, sourceId: string): BookingImportSnapshot['bindings'] {
  return db
    .select({
      id: bookingImportBindings.id,
      sourceId: bookingImportBindings.sourceId,
      selection: bookingImportBindings.selection,
      documentsOrigin: bookingImportBindings.documentsOrigin,
      mediaType: bookingImportBindings.mediaType,
      createdAt: bookingImportBindings.createdAt,
    })
    .from(bookingImportBindings)
    .where(eq(bookingImportBindings.sourceId, sourceId))
    .orderBy(asc(bookingImportBindings.id))
    .all()
    .map((row) => BookingSourceBindingSchema.parse(row));
}

function listAttempts(
  db: TripsDb,
  tripId: number,
  sourceId: string
): BookingImportSnapshot['attempts'] {
  return db
    .select({ id: bookingImportAttempts.id })
    .from(bookingImportAttempts)
    .where(eq(bookingImportAttempts.sourceId, sourceId))
    .orderBy(asc(bookingImportAttempts.id))
    .all()
    .map(({ id }) => bookingAttempt(db, tripId, sourceId, id));
}

function listDecisions(db: TripsDb, sourceId: string): BookingImportSnapshot['decisions'] {
  return db
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
    .where(eq(bookingImportDecisions.sourceId, sourceId))
    .orderBy(asc(bookingImportDecisions.id))
    .all()
    .map((row) => BookingDecisionSchema.parse(row));
}

function listAccepted(
  db: TripsDb,
  tripId: number,
  sourceId: string
): BookingImportSnapshot['accepted'] {
  return db
    .select()
    .from(bookingImportRequests)
    .where(
      and(eq(bookingImportRequests.tripId, tripId), eq(bookingImportRequests.sourceId, sourceId))
    )
    .all()
    .flatMap(({ operationId, receipt }) => {
      if (receipt.kind !== 'commit' || receipt.originalOperationId !== operationId) return [];
      return receipt.decisionIds.map((decisionId, index) => {
        const id = receipt.sourceOperationIds[index];
        if (id === undefined) throw new TripsServiceError('booking_import_invalid');
        return { decisionId, result: readSourceOperation(db, tripId, id) };
      });
    });
}

/** Read immutable decisions and original receipts beside current canonical and undone state. */
export function getBookingImport(
  db: TripsDb,
  tripId: number,
  sourceId: string
): BookingImportSnapshot {
  return db.transaction(
    (tx) =>
      BookingImportSnapshotSchema.parse({
        source: bookingSource(tx, tripId, sourceId),
        bindings: listBindings(tx, sourceId),
        attempts: listAttempts(tx, tripId, sourceId),
        decisions: listDecisions(tx, sourceId),
        accepted: listAccepted(tx, tripId, sourceId),
      }),
    { behavior: 'immediate' }
  );
}

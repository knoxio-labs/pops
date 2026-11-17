import { eq } from 'drizzle-orm';

import { bookingImportRequests } from '../schema.js';
import { readSourceOperation } from './source-operations.js';
import { TripsServiceError } from './source-record.js';

import type { BookingRequestReceipt } from '../../contract/booking-import-storage.js';
import type { BookingCommitResult, BookingDecision } from '../../contract/booking-import-values.js';
import type { TripsDb } from '../index.js';

export type CommitReceipt = Extract<BookingRequestReceipt, { kind: 'commit' }>;

/** Rebuilds a prior commit response from its durable request receipt. */
export function resultForBookingCommit(
  db: TripsDb,
  tripId: number,
  operationId: string,
  receipt: CommitReceipt
): BookingCommitResult {
  const results = receipt.sourceOperationIds.map((id) => readSourceOperation(db, tripId, id));
  return operationId === receipt.originalOperationId
    ? { kind: 'committed', operationId, results }
    : {
        kind: 'alreadyCommitted',
        requestedOperationId: operationId,
        originalOperationId: receipt.originalOperationId,
        results,
      };
}

/** Finds an earlier durable commit for a set of already committed decisions. */
export function originalBookingCommit(
  db: TripsDb,
  tripId: number,
  decisions: BookingDecision[]
): CommitReceipt | undefined {
  const originalId = decisions[0]?.committedOperationId;
  if (decisions.every((decision) => decision.committedOperationId === null)) return undefined;
  if (
    originalId === undefined ||
    originalId === null ||
    decisions.some((decision) => decision.committedOperationId !== originalId)
  )
    throw new TripsServiceError('booking_import_conflict');
  const receipt = db
    .select()
    .from(bookingImportRequests)
    .where(eq(bookingImportRequests.tripId, tripId))
    .all()
    .find((row) => row.operationId === originalId)?.receipt;
  if (receipt?.kind !== 'commit') throw new TripsServiceError('booking_import_conflict');
  const sourceOperationIds = decisions.map((decision) => {
    const index = receipt.decisionIds.indexOf(decision.id);
    const id = index < 0 ? undefined : receipt.sourceOperationIds[index];
    if (id === undefined) throw new TripsServiceError('booking_import_conflict');
    return id;
  });
  return { ...receipt, decisionIds: decisions.map((decision) => decision.id), sourceOperationIds };
}

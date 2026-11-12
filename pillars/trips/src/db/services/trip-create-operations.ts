import { eq } from 'drizzle-orm';

import {
  TripCreateOperationResultSchema,
  TripCreateOperationSchema,
} from '../../contract/trip-create-operations.js';
import { tripCreateOperations } from '../schema.js';
import { createTrip, getTrip } from './records.js';
import { canonicalSourceValue } from './source-canonical.js';
import { TripsServiceError } from './source-record.js';

import type {
  TripCreateOperation,
  TripCreateOperationResult,
} from '../../contract/trip-create-operations.js';
import type { TripsDb } from '../index.js';

function replay(
  db: TripsDb,
  operation: TripCreateOperation,
  canonicalRequest: string
): TripCreateOperationResult | undefined {
  const existing = db
    .select()
    .from(tripCreateOperations)
    .where(eq(tripCreateOperations.operationId, operation.operationId))
    .get();
  if (existing === undefined) return undefined;
  if (existing.canonicalRequest !== canonicalRequest)
    throw new TripsServiceError('trip_create_operation_mismatch');
  return TripCreateOperationResultSchema.parse({
    receipt: existing.receipt,
    current: { trip: getTrip(db, existing.tripId) },
    replayed: true,
  });
}

/** Create a Trip once for a stable operation UUID and retain its original acknowledgement. */
export async function createTripOperation(
  db: TripsDb,
  input: TripCreateOperation,
  prepare: (tripInput: TripCreateOperation['command']['input']) => Promise<void>
): Promise<TripCreateOperationResult> {
  const operation = TripCreateOperationSchema.parse(input);
  const canonicalRequest = canonicalSourceValue(operation);
  const prior = replay(db, operation, canonicalRequest);
  if (prior !== undefined) return prior;
  await prepare(operation.command.input);
  return db.transaction(
    (tx) => {
      const concurrentReplay = replay(tx, operation, canonicalRequest);
      if (concurrentReplay !== undefined) return concurrentReplay;
      const trip = createTrip(tx, operation.command.input);
      const receipt = { operationId: operation.operationId, trip };
      tx.insert(tripCreateOperations)
        .values({
          operationId: operation.operationId,
          tripId: trip.id,
          request: operation,
          canonicalRequest,
          receipt,
        })
        .run();
      return TripCreateOperationResultSchema.parse({
        receipt,
        current: { trip },
        replayed: false,
      });
    },
    { behavior: 'immediate' }
  );
}

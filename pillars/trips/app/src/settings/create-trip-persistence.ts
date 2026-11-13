import { tripMetadataReadSchema } from '@pops/trips-workspace';

import { createTripOperation, TripCreationRejection } from '../api/source';
import { assertTripCreationOwner } from './create-trip-owner';

import type { Trip, TripCreateRequest, TripCreateResult } from '../api/types';
import type { TripCreationOwner } from './create-trip-owner';

/** Validate the receipt against submitted fields; current metadata may legitimately have changed since creation. */
export function creationResult(
  value: TripCreateResult,
  request: TripCreateRequest
): TripCreateResult {
  const receipt = tripMetadataReadSchema.parse(value?.receipt?.trip);
  const current = tripMetadataReadSchema.parse(value?.current?.trip);
  const fields = ['name', 'destination', 'when', 'notes', 'parentId', 'tagId'] as const;
  const input = request.command.input;
  if (
    value.receipt.operationId !== request.operationId ||
    current.id !== receipt.id ||
    typeof value.replayed !== 'boolean' ||
    fields.some((field) => input[field] !== undefined && receipt[field] !== input[field])
  )
    throw new Error('Trip creation response does not match the submitted operation');
  return {
    receipt: { operationId: request.operationId, trip: receipt },
    current: { trip: current },
    replayed: value.replayed,
  };
}

/** An accepted original-owner acknowledgement survives later connection changes; dispatch never retargets. */
export async function persistTripCreation(
  owner: TripCreationOwner,
  request: TripCreateRequest
): Promise<TripCreateResult> {
  assertTripCreationOwner(owner);
  return creationResult(await createTripOperation(request, { tripClient: owner.client }), request);
}

/** These producer-owned validation failures occur before creation or inside its rolled-back transaction. */
export function creationWasRejected(error: unknown): boolean {
  return error instanceof TripCreationRejection;
}

/** Cache admission requires active owner proof; a late receipt cannot seed a different connection. */
export function cacheTripCreation(owner: TripCreationOwner, trip: Trip): void {
  assertTripCreationOwner(owner);
  const all = ['trips', owner.origin, 'list'] as const;
  owner.scope.setQueryData(['trips', owner.origin, trip.id], trip);
  owner.scope.setQueryData<Trip[]>(all, (previous) => [
    ...(previous ?? []).filter((item) => item.id !== trip.id),
    trip,
  ]);
  void owner.scope.invalidateQueries({ queryKey: all });
}

import {
  assertSourceOwner,
  tripMetadataReadSchema,
  tripMetadataWriteSchema,
} from '@pops/trips-workspace';

import { loadTrip, updateTrip } from '../api/source';

import type { RetainedSourceOwner } from '@pops/trips-workspace';

import type { Trip, TripInput } from '../api/types';

/** Raw canonical Trip keys remain compatible with existing readers; metadata reads have their own query binding. */
export function metadataKeys(owner: RetainedSourceOwner) {
  return {
    one: ['trips', owner.origin, owner.tripId] as const,
    read: ['trips', owner.origin, owner.tripId, 'metadata'] as const,
    all: ['trips', owner.origin, 'list'] as const,
  };
}
/** Validate the actual producer shape and selected identity before admitting metadata. */
export function metadataSource(value: unknown, tripId: number): Trip {
  const source = tripMetadataReadSchema.parse(value);
  if (source.id !== tripId) throw new Error('Foreign metadata source response');
  return source;
}
/** Captured transport and matching supplied fields are required before a PATCH can establish own inverse history. */
export async function persistMetadata(owner: RetainedSourceOwner, body: TripInput): Promise<Trip> {
  assertSourceOwner(owner);
  const result = tripMetadataWriteSchema.parse(
    await updateTrip(owner.tripId, body, { tripClient: owner.client })
  );
  assertSourceOwner(owner);
  const fields = ['name', 'destination', 'when', 'notes', 'parentId', 'tagId'] as const;
  if (
    result.id !== owner.tripId ||
    fields.some((field) => body[field] !== undefined && result[field] !== body[field])
  )
    throw new Error('Metadata response does not match the submitted fields');
  return result;
}
/** Fence both dispatch and asynchronous delivery; a source GET is never a PATCH receipt. */
export async function readMetadata(owner: RetainedSourceOwner): Promise<Trip> {
  assertSourceOwner(owner);
  const result = metadataSource(
    await loadTrip(owner.tripId, { tripClient: owner.client }),
    owner.tripId
  );
  assertSourceOwner(owner);
  return result;
}
/** Update only raw original-owner Trip caches and invalidate only that owner's list. */
export function cacheMetadata(owner: RetainedSourceOwner, result: Trip): void {
  const keys = metadataKeys(owner);
  assertSourceOwner(owner);
  owner.scope.setQueryData(keys.one, result);
  assertSourceOwner(owner);
  owner.scope.setQueryData(keys.read, result);
  assertSourceOwner(owner);
  owner.scope.setQueryData<Trip[]>(keys.all, (previous) =>
    previous?.map((trip) => (trip.id === result.id ? result : trip))
  );
  assertSourceOwner(owner);
  void owner.scope.invalidateQueries({ queryKey: keys.all });
}

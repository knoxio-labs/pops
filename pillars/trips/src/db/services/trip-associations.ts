import { eq } from 'drizzle-orm';

import { sharedTagIds, trips } from '../schema.js';
import { TripsServiceError } from './source-record.js';

import type { TripInput } from '../../contract/schemas.js';
import type { TripsDb } from '../index.js';

/** Atomically replace a complete Tags-owned identity snapshot without modifying trip references. */
export function replaceSharedTagIds(db: TripsDb, ids: readonly string[]): void {
  db.transaction((tx) => {
    tx.delete(sharedTagIds).run();
    const values = [...new Set(ids)].map((id) => ({ id, fetchedAt: new Date().toISOString() }));
    if (values.length) tx.insert(sharedTagIds).values(values).run();
  });
}

/** Check the last successful vocabulary snapshot, including archived/merged identities retained by Tags. */
export function isKnownSharedTag(db: TripsDb, id: string): boolean {
  return (
    db.select({ id: sharedTagIds.id }).from(sharedTagIds).where(eq(sharedTagIds.id, id)).get() !==
    undefined
  );
}

/** Validate only supplied associations; omitted or cleared references never gain dependencies. */
export function validateTripAssociations(db: TripsDb, input: TripInput, id?: number): void {
  if (input.tagId && !isKnownSharedTag(db, input.tagId)) throw new TripsServiceError('tag_unknown');
  let cursor = input.parentId;
  const visited = new Set(id === undefined ? [] : [id]);
  while (cursor !== undefined && cursor !== null) {
    if (visited.has(cursor)) throw new TripsServiceError('parent_invalid');
    visited.add(cursor);
    const parent = db
      .select({ parentId: trips.parentId })
      .from(trips)
      .where(eq(trips.id, cursor))
      .get();
    if (parent === undefined) throw new TripsServiceError('parent_invalid');
    cursor = parent.parentId;
  }
}

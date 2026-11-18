import { asc, eq } from 'drizzle-orm';

import { CreatePlaceBody, PlaceSchema, UpdatePlaceBody } from '../../contract/schemas.js';
import { places } from '../schema.js';
import { requireOwnedRecord } from './source-record.js';

import type { Place, PlaceInput, PlaceUpdate } from '../../contract/schemas.js';
import type { TripsDb } from '../index.js';

/** Lists manually captured place identities without provider inference or deduplication. */
export function listPlaces(db: TripsDb): Place[] {
  return db
    .select()
    .from(places)
    .orderBy(asc(places.id))
    .all()
    .map((row) => PlaceSchema.parse(row));
}

/** Resolves an explicit place identity. */
export function getPlace(db: TripsDb, id: number): Place {
  return PlaceSchema.parse(
    requireOwnedRecord(db.select().from(places).where(eq(places.id, id)).get())
  );
}

/** Creates a reusable place without guessing whether similarly named places are identical. */
export function createPlace(db: TripsDb, input: PlaceInput): Place {
  const fields = CreatePlaceBody.parse(input);
  return PlaceSchema.parse(requireOwnedRecord(db.insert(places).values(fields).returning().get()));
}

/** Patches a place; omitted pins persist and null explicitly clears the point. */
export function updatePlace(db: TripsDb, id: number, input: PlaceUpdate): Place {
  return PlaceSchema.parse(
    requireOwnedRecord(
      db
        .update(places)
        .set({ ...UpdatePlaceBody.parse(input), updatedAt: new Date().toISOString() })
        .where(eq(places.id, id))
        .returning()
        .get()
    )
  );
}

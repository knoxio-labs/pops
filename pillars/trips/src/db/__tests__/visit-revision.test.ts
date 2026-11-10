import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { visits } from '../schema.js';
import {
  createPlace,
  createTrip,
  createVisit,
  getVisit,
  listVisits,
  reorderVisits,
  updateVisit,
} from '../services/records.js';
import { createStay, getStay } from '../services/stays.js';

let opened: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'visit-revision-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const db = opened.db;
  const tripId = createTrip(db, {}).id;
  const placeId = createPlace(db, { name: 'Repeated city' }).id;
  const first = createVisit(db, tripId, { placeId });
  const second = createVisit(db, tripId, { placeId });
  return { db, tripId, first, second };
}
it('guards stale inverse writes across independent connections and preserves bookings', () => {
  const { db, tripId, first, second } = fixture();
  const stay = createStay(db, tripId, {
    visitId: first.id,
    status: 'Purchased',
    timing: { arrival: '2030-01-01', departure: '2030-01-03' },
  });
  const own = updateVisit(db, tripId, first.id, { expectedRevision: 0, notes: 'Own edit' });
  expect(own.revision).toBe(1);
  const competing = openTripsDb(join(directory, 'trips.db'));
  try {
    const foreign = updateVisit(competing.db, tripId, first.id, {
      expectedRevision: 1,
      timing: { departure: '2030-01-02' },
    });
    expect(foreign.revision).toBe(2);
    expect(() =>
      updateVisit(db, tripId, first.id, { expectedRevision: own.revision, notes: first.notes })
    ).toThrow('visit_revision_conflict');
    expect(getVisit(db, tripId, first.id)).toEqual(foreign);
    expect(getVisit(db, tripId, second.id)).toEqual(second);
    expect(getStay(db, tripId, stay.id)).toEqual(stay);
  } finally {
    competing.raw.close();
  }
});
it('advances compatible unguarded writes and ordering, rejects invalid writes without advancing', () => {
  const { db, tripId, first, second } = fixture();
  expect(updateVisit(db, tripId, first.id, {}).revision).toBe(1);
  expect(() => updateVisit(db, tripId, first.id, { expectedRevision: 1, placeId: 99999 })).toThrow(
    'not_found'
  );
  expect(getVisit(db, tripId, first.id).revision).toBe(1);
  expect(reorderVisits(db, tripId, [second.id, first.id]).map((visit) => visit.revision)).toEqual([
    1, 2,
  ]);
  expect(() => updateVisit(db, tripId, first.id, { expectedRevision: 1, notes: 'Stale' })).toThrow(
    'visit_revision_conflict'
  );
});
it('rejects safe-integer exhaustion atomically, including all route rows', () => {
  const { db, tripId, first, second } = fixture();
  db.update(visits)
    .set({ revision: Number.MAX_SAFE_INTEGER })
    .where(eq(visits.id, second.id))
    .run();
  const before = listVisits(db, tripId);
  expect(() => updateVisit(db, tripId, second.id, { notes: 'Overflow' })).toThrow(
    'visit_revision_exhausted'
  );
  expect(() => reorderVisits(db, tripId, [second.id, first.id])).toThrow(
    'visit_revision_exhausted'
  );
  expect(listVisits(db, tripId)).toEqual(before);
});

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { openTripsDb } from '../index.js';
import { rentals, visits } from '../schema.js';
import {
  createPlace,
  createTrip,
  createVisit,
  getVisit,
  listVisits,
  reorderVisits,
} from '../services/records.js';
import {
  createRental,
  deleteRental,
  getRental,
  listRentals,
  updateRental,
} from '../services/rentals.js';

describe('Rental source persistence', () => {
  it('keeps one identity and independent dates through repeated towns and Visit movement', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const place = createPlace(db, { name: 'Repeated town' });
      const pickup = createVisit(db, trip.id, {
        placeId: place.id,
        timing: { arrival: '2028-01-01' },
      });
      const returned = createVisit(db, trip.id, {
        placeId: place.id,
        timing: { arrival: '2028-02-01' },
      });
      const rental = createRental(db, trip.id, {
        provider: 'Source supplier',
        pickupVisitId: pickup.id,
        returnVisitId: returned.id,
        start: '2028-01-08',
        status: 'Reserved',
      });
      expect(rental).toMatchObject({ end: null, revision: 0, status: 'Reserved' });
      reorderVisits(db, trip.id, [returned.id, pickup.id]);
      expect(getRental(db, trip.id, rental.id)).toEqual(rental);
      expect(listVisits(db, trip.id).map((visit) => visit.id)).toEqual([returned.id, pickup.id]);
      expect(getVisit(db, trip.id, pickup.id).timing).toEqual({ arrival: '2028-01-01' });
      expect(listRentals(db, trip.id)).toEqual([rental]);
    } finally {
      opened.raw.close();
    }
  });

  it('retains partial, equal and reversed bounds, omitted values and independent clearing', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const empty = createRental(db, trip.id, {});
      expect(empty).toMatchObject({
        provider: null,
        pickupVisitId: null,
        returnVisitId: null,
        start: null,
        end: null,
        status: null,
        revision: 0,
      });
      const endOnly = updateRental(db, trip.id, empty.id, {
        expectedRevision: 0,
        end: '2028-02-29',
        status: 'Considering',
      });
      expect(endOnly).toMatchObject({
        start: null,
        end: '2028-02-29',
        status: 'Considering',
        revision: 1,
      });
      const equal = updateRental(db, trip.id, empty.id, {
        expectedRevision: 1,
        start: '2028-02-29',
        status: 'Reserved',
      });
      expect(equal).toMatchObject({
        start: '2028-02-29',
        end: '2028-02-29',
        status: 'Reserved',
        revision: 2,
      });
      const reversed = updateRental(db, trip.id, empty.id, {
        expectedRevision: 2,
        start: '2028-03-01',
        status: 'Purchased',
      });
      expect(reversed).toMatchObject({
        start: '2028-03-01',
        end: '2028-02-29',
        status: 'Purchased',
        revision: 3,
      });
      expect(
        updateRental(db, trip.id, empty.id, { expectedRevision: 3, start: null, status: null })
      ).toMatchObject({ start: null, end: '2028-02-29', status: null, revision: 4 });
    } finally {
      opened.raw.close();
    }
  });

  it('rejects absent, foreign, stale and exhausted writes without partial mutation', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const foreign = createTrip(db, {});
      const place = createPlace(db, { name: 'Source town' });
      const otherVisit = createVisit(db, foreign.id, { placeId: place.id });
      const rental = createRental(db, trip.id, { provider: 'Retained' });
      for (const visitId of [otherVisit.id, 99999]) {
        expect(() => createRental(db, trip.id, { pickupVisitId: visitId })).toThrow('not_found');
        expect(() => createRental(db, trip.id, { returnVisitId: visitId })).toThrow('not_found');
        expect(() =>
          updateRental(db, trip.id, rental.id, {
            expectedRevision: 0,
            returnVisitId: visitId,
            provider: 'Rejected',
          })
        ).toThrow('not_found');
        expect(getRental(db, trip.id, rental.id)).toEqual(rental);
      }
      expect(() => createRental(db, 99999, {})).toThrow('not_found');
      expect(() => listRentals(db, 99999)).toThrow('not_found');
      expect(() => getRental(db, foreign.id, rental.id)).toThrow('not_found');
      expect(() => updateRental(db, foreign.id, rental.id, { expectedRevision: 0 })).toThrow(
        'not_found'
      );
      expect(() => deleteRental(db, foreign.id, rental.id, 0)).toThrow('not_found');
      expect(() =>
        updateRental(db, trip.id, rental.id, { expectedRevision: 1, status: 'Purchased' })
      ).toThrow('arrangement_revision_conflict');
      expect(() => deleteRental(db, trip.id, rental.id, 1)).toThrow(
        'arrangement_revision_conflict'
      );
      expect(listRentals(db, trip.id)).toEqual([rental]);
      db.update(rentals)
        .set({ revision: Number.MAX_SAFE_INTEGER })
        .where(eq(rentals.id, rental.id))
        .run();
      expect(() =>
        updateRental(db, trip.id, rental.id, { expectedRevision: Number.MAX_SAFE_INTEGER })
      ).toThrow('arrangement_revision_conflict');
      expect(() => deleteRental(db, trip.id, rental.id, Number.MAX_SAFE_INTEGER)).toThrow(
        'arrangement_revision_conflict'
      );
      expect(getRental(db, trip.id, rental.id)).toEqual({
        ...rental,
        revision: Number.MAX_SAFE_INTEGER,
      });
      expect(() => db.insert(rentals).values({ tripId: 99999 }).run()).toThrow(/FOREIGN KEY/u);
    } finally {
      opened.raw.close();
    }
  });

  it('retains a removed Visit identity and permits unrelated or unchanged-reference edits', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const place = createPlace(db, { name: 'Removed stop' });
      const visit = createVisit(db, trip.id, { placeId: place.id });
      const rental = createRental(db, trip.id, {
        pickupVisitId: visit.id,
        returnVisitId: visit.id,
        start: '2028-04-01',
        end: '2028-04-02',
      });
      db.delete(visits).where(eq(visits.id, visit.id)).run();
      expect(getRental(db, trip.id, rental.id)).toEqual(rental);
      expect(
        updateRental(db, trip.id, rental.id, {
          expectedRevision: 0,
          provider: 'Captured later',
          pickupVisitId: visit.id,
        })
      ).toMatchObject({
        pickupVisitId: visit.id,
        returnVisitId: visit.id,
        start: rental.start,
        end: rental.end,
        revision: 1,
      });
      expect(() => createRental(db, trip.id, { pickupVisitId: visit.id })).toThrow('not_found');
      const cleared = updateRental(db, trip.id, rental.id, {
        expectedRevision: 1,
        pickupVisitId: null,
        returnVisitId: null,
      });
      expect(cleared).toMatchObject({
        pickupVisitId: null,
        returnVisitId: null,
        start: rental.start,
        end: rental.end,
      });
      deleteRental(db, trip.id, rental.id, 2);
      expect(listRentals(db, trip.id)).toEqual([]);
    } finally {
      opened.raw.close();
    }
  });
});

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { events, journeys, journeyLegs, rentals, stays, visits } from '../schema.js';
import { requireCaptureTarget } from '../services/capture-targets.js';
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from '../services/events.js';
import { createJourneyLeg, deleteJourneyLeg, listJourneyLegs } from '../services/journey-legs.js';
import {
  createJourney,
  deleteJourney,
  getJourney,
  listJourneys,
  updateJourney,
} from '../services/journeys.js';
import { removeJourneyLeg, restoreJourneyLeg } from '../services/leg-removals.js';
import { getJourneyLegSet } from '../services/leg-set.js';
import {
  createPlace,
  createTrip,
  createVisit,
  getVisit,
  listVisits,
  updateVisit,
} from '../services/records.js';
import {
  createRental,
  deleteRental,
  getRental,
  listRentals,
  updateRental,
} from '../services/rentals.js';
import { readSourceWorkspace } from '../services/source-queries.js';
import { createStay, deleteStay, getStay, listStays, updateStay } from '../services/stays.js';
import { withCaptureDb } from './capture-test-utils.js';

const lifecycle = {
  removedAt: '2028-01-02T03:04:05.000Z',
  removalOperationId: '15a36790-ff5f-4fb5-bc8a-154d8a70a8a5',
  removalRevision: 1,
};

describe('Retained source removal lifecycle', () => {
  it('hides every removed source and rejects detail, edits and explicit hard deletion without touching history', () =>
    withCaptureDb((db) => {
      const tripId = createTrip(db, {}).id;
      const place = createPlace(db, { name: 'Reusable place' });
      const visit = createVisit(db, tripId, { placeId: place.id });
      const journey = createJourney(db, tripId, {});
      const leg = createJourneyLeg(db, tripId, journey.id, {});
      const stay = createStay(db, tripId, {});
      const event = createEvent(db, tripId, {});
      const rental = createRental(db, tripId, {});
      db.update(visits).set(lifecycle).where(eq(visits.id, visit.id)).run();
      db.update(journeys).set(lifecycle).where(eq(journeys.id, journey.id)).run();
      db.update(stays).set(lifecycle).where(eq(stays.id, stay.id)).run();
      db.update(events).set(lifecycle).where(eq(events.id, event.id)).run();
      db.update(rentals).set(lifecycle).where(eq(rentals.id, rental.id)).run();
      const before = {
        visits: db.select().from(visits).all(),
        journeys: db.select().from(journeys).all(),
        legs: db.select().from(journeyLegs).all(),
        stays: db.select().from(stays).all(),
        events: db.select().from(events).all(),
        rentals: db.select().from(rentals).all(),
      };
      expect(listVisits(db, tripId)).toEqual([]);
      expect(listJourneys(db, tripId)).toEqual([]);
      expect(listStays(db, tripId)).toEqual([]);
      expect(listEvents(db, tripId)).toEqual([]);
      expect(listRentals(db, tripId)).toEqual([]);
      expect(readSourceWorkspace(db, tripId)).toMatchObject({
        events: [],
        journeys: [],
        stays: [],
      });
      for (const readOrWrite of [
        () => getVisit(db, tripId, visit.id),
        () => updateVisit(db, tripId, visit.id, { notes: 'Rejected' }),
        () => getJourney(db, tripId, journey.id),
        () => updateJourney(db, tripId, journey.id, { notes: 'Rejected' }),
        () => deleteJourney(db, tripId, journey.id),
        () => listJourneyLegs(db, tripId, journey.id),
        () => getJourneyLegSet(db, tripId, journey.id),
        () => createJourneyLeg(db, tripId, journey.id, {}),
        () => deleteJourneyLeg(db, tripId, journey.id, leg.id),
        () => getStay(db, tripId, stay.id),
        () => updateStay(db, tripId, stay.id, { notes: 'Rejected' }),
        () => deleteStay(db, tripId, stay.id),
        () => getEvent(db, tripId, event.id),
        () => updateEvent(db, tripId, event.id, { notes: 'Rejected' }),
        () => deleteEvent(db, tripId, event.id),
        () => getRental(db, tripId, rental.id),
        () => updateRental(db, tripId, rental.id, { expectedRevision: 0, provider: 'Rejected' }),
        () => deleteRental(db, tripId, rental.id, 0),
        () => requireCaptureTarget(db, tripId, { kind: 'journey', id: journey.id }),
        () => requireCaptureTarget(db, tripId, { kind: 'stay', id: stay.id }),
        () => requireCaptureTarget(db, tripId, { kind: 'event', id: event.id }),
      ])
        expect(readOrWrite).toThrow('not_found');
      expect({
        visits: db.select().from(visits).all(),
        journeys: db.select().from(journeys).all(),
        legs: db.select().from(journeyLegs).all(),
        stays: db.select().from(stays).all(),
        events: db.select().from(events).all(),
        rentals: db.select().from(rentals).all(),
      }).toEqual(before);
      const repeated = createVisit(db, tripId, { placeId: place.id });
      expect(repeated.id).not.toBe(visit.id);
      expect(listVisits(db, tripId)).toEqual([repeated]);
    }));

  it('rejects new archived Visit links while retaining unchanged rental endpoints', () =>
    withCaptureDb((db) => {
      const tripId = createTrip(db, {}).id;
      const visit = createVisit(db, tripId, {
        placeId: createPlace(db, { name: 'Occurrence' }).id,
      });
      const rental = createRental(db, tripId, { pickupVisitId: visit.id, returnVisitId: visit.id });
      const unlinked = createRental(db, tripId, {});
      db.update(visits).set(lifecycle).where(eq(visits.id, visit.id)).run();
      for (const write of [
        () => createStay(db, tripId, { visitId: visit.id }),
        () => createEvent(db, tripId, { visitId: visit.id }),
        () => createRental(db, tripId, { pickupVisitId: visit.id }),
        () =>
          updateRental(db, tripId, unlinked.id, { expectedRevision: 0, pickupVisitId: visit.id }),
        () =>
          updateRental(db, tripId, unlinked.id, { expectedRevision: 0, returnVisitId: visit.id }),
      ])
        expect(write).toThrow('not_found');
      expect(getRental(db, tripId, rental.id)).toEqual(rental);
      expect(getRental(db, tripId, unlinked.id)).toEqual(unlinked);
      expect(
        updateRental(db, tripId, rental.id, {
          expectedRevision: 0,
          pickupVisitId: visit.id,
          returnVisitId: visit.id,
          provider: 'Unrelated',
        })
      ).toMatchObject({
        pickupVisitId: visit.id,
        returnVisitId: visit.id,
        provider: 'Unrelated',
      });
    }));

  it('prevents leg receipt replay or restore from acting through an archived Journey', () =>
    withCaptureDb((db) => {
      const tripId = createTrip(db, {}).id;
      const journey = createJourney(db, tripId, {});
      const leg = createJourneyLeg(db, tripId, journey.id, {});
      const owner = { tripId, journeyId: journey.id };
      const input = { operationId: lifecycle.removalOperationId, expectedRevision: 1 };
      removeJourneyLeg(db, { ...owner, id: leg.id }, input);
      db.update(journeys).set(lifecycle).where(eq(journeys.id, journey.id)).run();
      expect(() => removeJourneyLeg(db, { ...owner, id: leg.id }, input)).toThrow('not_found');
      expect(() => restoreJourneyLeg(db, { ...owner, operationId: input.operationId }, 2)).toThrow(
        'not_found'
      );
      expect(db.select().from(journeyLegs).get()).toMatchObject({
        id: leg.id,
        removedAt: expect.any(String),
        removalOperationId: input.operationId,
      });
    }));
});

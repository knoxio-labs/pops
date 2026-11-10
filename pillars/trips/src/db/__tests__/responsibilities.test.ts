import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { openTripsDb } from '../index.js';
import { arrangementResponsibilities } from '../schema.js';
import { createEvent, deleteEvent, getEvent } from '../services/events.js';
import { createJourneyGroup } from '../services/journey-groups.js';
import { createJourneyLeg } from '../services/journey-legs.js';
import { createJourney, deleteJourney, getJourney } from '../services/journeys.js';
import { removeJourneyLeg, restoreJourneyLeg } from '../services/leg-removals.js';
import { createTrip } from '../services/records.js';
import { createRental, deleteRental, getRental, updateRental } from '../services/rentals.js';
import {
  getResponsibility,
  listResponsibilities,
  replaceResponsibility,
} from '../services/responsibilities.js';
import { hasResponsibilityForTarget } from '../services/responsibility-references.js';
import { createStay, deleteStay, getStay } from '../services/stays.js';

describe('Explicit arrangement responsibility persistence', () => {
  it('replaces and clears unresolved canonical identities without changing source records', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const journey = createJourney(db, trip.id, { reference: 'Reserved reference' });
      const stay = createStay(db, trip.id, {
        hostLinks: [{ uri: 'pops:contacts/contact/host' }],
        status: 'Purchased',
      });
      const event = createEvent(db, trip.id, {
        organiserLinks: [{ uri: 'pops:contacts/contact/operator' }],
      });
      const rental = createRental(db, trip.id, { provider: 'Operator', status: 'Purchased' });
      expect(listResponsibilities(db, trip.id)).toEqual([]);
      for (const [kind, source] of [
        ['journey', journey],
        ['stay', stay],
        ['event', event],
        ['rental', rental],
      ] as const) {
        expect(getResponsibility(db, trip.id, kind, source.id)).toEqual({
          tripId: trip.id,
          targetKind: kind,
          targetId: source.id,
          responsibility: null,
          revision: 0,
        });
        expect(hasResponsibilityForTarget(db, trip.id, kind, source.id)).toBe(false);
        const unresolved = {
          kind: 'contact',
          uri: 'pops:contacts/contact/opaque+identity:%2Fkept#source',
        } as const;
        expect(
          replaceResponsibility(
            db,
            trip.id,
            { kind, id: source.id },
            { expectedRevision: 0, responsibility: unresolved }
          )
        ).toMatchObject({
          responsibility: unresolved,
          revision: 1,
        });
        expect(getResponsibility(db, trip.id, kind, source.id).responsibility).toEqual(unresolved);
        expect(hasResponsibilityForTarget(db, trip.id, kind, source.id)).toBe(true);
        expect(
          replaceResponsibility(
            db,
            trip.id,
            { kind, id: source.id },
            { expectedRevision: 1, responsibility: { kind: 'self' } }
          )
        ).toMatchObject({ responsibility: { kind: 'self' }, revision: 2 });
        expect(
          replaceResponsibility(
            db,
            trip.id,
            { kind, id: source.id },
            { expectedRevision: 2, responsibility: null }
          )
        ).toMatchObject({
          responsibility: null,
          revision: 3,
        });
        expect(() =>
          replaceResponsibility(
            db,
            trip.id,
            { kind, id: source.id },
            { expectedRevision: 0, responsibility: unresolved }
          )
        ).toThrow('arrangement_revision_conflict');
        expect(getResponsibility(db, trip.id, kind, source.id)).toMatchObject({
          responsibility: null,
          revision: 3,
        });
        expect(hasResponsibilityForTarget(db, trip.id, kind, source.id)).toBe(false);
      }
      expect(getJourney(db, trip.id, journey.id)).toEqual(journey);
      expect(getStay(db, trip.id, stay.id)).toEqual(stay);
      expect(getEvent(db, trip.id, event.id)).toEqual(event);
      expect(getRental(db, trip.id, rental.id)).toEqual(rental);
      expect(listResponsibilities(db, trip.id)).toHaveLength(4);
      expect(db.select().from(arrangementResponsibilities).all()).toHaveLength(4);
      expect(
        updateRental(db, trip.id, rental.id, { expectedRevision: 0, provider: null })
      ).toMatchObject({ revision: 1, status: 'Purchased' });
      expect(getResponsibility(db, trip.id, 'rental', rental.id).revision).toBe(3);
    } finally {
      opened.raw.close();
    }
  });

  it('rejects foreign and missing whole targets transactionally, including colliding kind identities', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const other = createTrip(db, {});
      const journey = createJourney(db, other.id, {});
      const stay = createStay(db, other.id, {});
      const event = createEvent(db, other.id, {});
      const rental = createRental(db, other.id, {});
      for (const [kind, source] of [
        ['journey', journey],
        ['stay', stay],
        ['event', event],
        ['rental', rental],
      ] as const) {
        for (const id of [source.id, 99999]) {
          expect(() => getResponsibility(db, trip.id, kind, id)).toThrow('not_found');
          expect(() =>
            replaceResponsibility(
              db,
              trip.id,
              { kind: kind, id: id },
              { expectedRevision: 0, responsibility: { kind: 'self' } }
            )
          ).toThrow('not_found');
          expect(() =>
            replaceResponsibility(
              db,
              trip.id,
              { kind: kind, id: id },
              { expectedRevision: 0, responsibility: null }
            )
          ).toThrow('not_found');
        }
        expect(getResponsibility(db, other.id, kind, source.id).revision).toBe(0);
      }
      expect(() => listResponsibilities(db, 99999)).toThrow('not_found');
      expect(listResponsibilities(db, trip.id)).toEqual([]);
      expect(listResponsibilities(db, other.id)).toEqual([]);
      replaceResponsibility(
        db,
        other.id,
        { kind: 'rental', id: rental.id },
        { expectedRevision: 0, responsibility: { kind: 'self' } }
      );
      expect(hasResponsibilityForTarget(db, trip.id, 'rental', rental.id)).toBe(false);
      expect(hasResponsibilityForTarget(db, other.id, 'journey', journey.id)).toBe(false);
      expect(hasResponsibilityForTarget(db, other.id, 'rental', rental.id)).toBe(true);
    } finally {
      opened.raw.close();
    }
  });

  it('refuses exhausted revisions and enforces one assignment per target in SQLite', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const rental = createRental(db, trip.id, {});
      const state = replaceResponsibility(
        db,
        trip.id,
        { kind: 'rental', id: rental.id },
        { expectedRevision: 0, responsibility: { kind: 'self' } }
      );
      expect(() =>
        db
          .insert(arrangementResponsibilities)
          .values({
            tripId: trip.id,
            targetKind: 'rental',
            targetId: rental.id,
            responsibility: null,
            revision: 1,
          })
          .run()
      ).toThrow(/UNIQUE/u);
      expect(() =>
        replaceResponsibility(
          db,
          trip.id,
          { kind: 'rental', id: rental.id },
          { expectedRevision: 0, responsibility: null }
        )
      ).toThrow('arrangement_revision_conflict');
      expect(getResponsibility(db, trip.id, 'rental', rental.id)).toEqual(state);
      db.update(arrangementResponsibilities)
        .set({ revision: Number.MAX_SAFE_INTEGER })
        .where(eq(arrangementResponsibilities.targetId, rental.id))
        .run();
      expect(() =>
        replaceResponsibility(
          db,
          trip.id,
          { kind: 'rental', id: rental.id },
          { expectedRevision: Number.MAX_SAFE_INTEGER, responsibility: null }
        )
      ).toThrow('arrangement_revision_conflict');
      expect(getResponsibility(db, trip.id, 'rental', rental.id)).toEqual({
        ...state,
        revision: Number.MAX_SAFE_INTEGER,
      });
    } finally {
      opened.raw.close();
    }
  });

  it('deletes only responsibility for the explicitly deleted target in the same transaction', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const journey = createJourney(db, trip.id, {});
      const stay = createStay(db, trip.id, {});
      const event = createEvent(db, trip.id, {});
      const rental = createRental(db, trip.id, {});
      for (const [kind, source] of [
        ['journey', journey],
        ['stay', stay],
        ['event', event],
        ['rental', rental],
      ] as const)
        replaceResponsibility(
          db,
          trip.id,
          { kind, id: source.id },
          {
            expectedRevision: 0,
            responsibility: {
              kind: 'contact',
              uri: 'pops:contacts/contact/retained',
            },
          }
        );
      deleteStay(db, trip.id, stay.id);
      expect(listResponsibilities(db, trip.id).map((row) => row.targetKind)).toEqual([
        'journey',
        'event',
        'rental',
      ]);
      deleteEvent(db, trip.id, event.id);
      deleteJourney(db, trip.id, journey.id);
      expect(listResponsibilities(db, trip.id).map((row) => row.targetKind)).toEqual(['rental']);
      deleteRental(db, trip.id, rental.id, 0);
      expect(listResponsibilities(db, trip.id)).toEqual([]);
      expect(() => getResponsibility(db, trip.id, 'rental', rental.id)).toThrow('not_found');
    } finally {
      opened.raw.close();
    }
  });
  it('preserves responsibility when a grouped journey cannot be deleted', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const journey = createJourney(db, trip.id, {});
      createJourneyGroup(db, trip.id, { currentJourneyId: journey.id });
      const state = replaceResponsibility(
        db,
        trip.id,
        { kind: 'journey', id: journey.id },
        { expectedRevision: 0, responsibility: { kind: 'self' } }
      );
      expect(() => deleteJourney(db, trip.id, journey.id)).toThrow('journey_grouped');
      expect(getResponsibility(db, trip.id, 'journey', journey.id)).toEqual(state);
      expect(hasResponsibilityForTarget(db, trip.id, 'journey', journey.id)).toBe(true);
    } finally {
      opened.raw.close();
    }
  });
  it('keeps responsibility on the whole journey through leg removal and identity-preserving restore', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const journey = createJourney(db, trip.id, {});
      const leg = createJourneyLeg(db, trip.id, journey.id, { expectedRevision: 0 });
      const state = replaceResponsibility(
        db,
        trip.id,
        { kind: 'journey', id: journey.id },
        {
          expectedRevision: 0,
          responsibility: { kind: 'contact', uri: 'pops:contacts/contact/retained-handler' },
        }
      );
      const owner = { tripId: trip.id, journeyId: journey.id };
      const operationId = 'c84716e2-51fa-4bf5-95d3-4fbb9fb619dc';
      removeJourneyLeg(db, { ...owner, id: leg.id }, { expectedRevision: 1, operationId });
      expect(getResponsibility(db, trip.id, 'journey', journey.id)).toEqual(state);
      restoreJourneyLeg(db, { ...owner, operationId }, 2);
      expect(listResponsibilities(db, trip.id)).toEqual([state]);
      deleteJourney(db, trip.id, journey.id);
      expect(listResponsibilities(db, trip.id)).toEqual([]);
    } finally {
      opened.raw.close();
    }
  });
});

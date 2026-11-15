import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  arrangementResponsibilities,
  events,
  journeys,
  journeyGroupMembers,
  rentals,
  stays,
  tripDocumentAssociations,
  visits,
} from '../schema.js';
import {
  createDocumentAssociation,
  deleteDocumentAssociation,
  listDocumentAssociations,
} from '../services/document-associations.js';
import { createEvent } from '../services/events.js';
import { getJourneyGroup, listJourneyGroups } from '../services/journey-group-queries.js';
import {
  addBlankJourneyAlternative,
  createJourneyGroup,
  selectJourneyAlternative,
} from '../services/journey-groups.js';
import { createJourney } from '../services/journeys.js';
import { createPlace, createTrip, createVisit } from '../services/records.js';
import { createRental } from '../services/rentals.js';
import {
  getResponsibility,
  listResponsibilities,
  replaceResponsibility,
} from '../services/responsibilities.js';
import { createStay } from '../services/stays.js';
import { withCaptureDb } from './capture-test-utils.js';

const lifecycle = {
  removedAt: '2028-01-02T03:04:05.000Z',
  removalOperationId: '187f52b1-a3d3-40d0-9e1f-6ccbb19cf06a',
  removalRevision: 1,
};

describe('Live association targets and retained history', () => {
  it('filters all supported removed targets, rejects writes and reveals the same relation identities on restore', () =>
    withCaptureDb((db) => {
      const tripId = createTrip(db, {}).id;
      const visit = createVisit(db, tripId, { placeId: createPlace(db, { name: 'Town' }).id });
      const journey = createJourney(db, tripId, {});
      const stay = createStay(db, tripId, {});
      const event = createEvent(db, tripId, {});
      const rental = createRental(db, tripId, {});
      const tripAssociation = createDocumentAssociation(db, tripId, {
        documentId: 10,
        targetKind: 'trip',
        targetId: tripId,
      });
      const documentTargets = [
        { targetKind: 'visit', targetId: visit.id },
        { targetKind: 'journey', targetId: journey.id },
        { targetKind: 'stay', targetId: stay.id },
        { targetKind: 'event', targetId: event.id },
      ] as const;
      const documents = documentTargets.map((target) =>
        createDocumentAssociation(db, tripId, { documentId: 10, ...target })
      );
      const responsibilityTargets = [
        { kind: 'journey', id: journey.id },
        { kind: 'stay', id: stay.id },
        { kind: 'event', id: event.id },
        { kind: 'rental', id: rental.id },
      ] as const;
      const responsibilities = responsibilityTargets.map((target) =>
        replaceResponsibility(db, tripId, target, {
          expectedRevision: 0,
          responsibility: { kind: 'self' },
        })
      );
      const history = {
        documents: db.select().from(tripDocumentAssociations).all(),
        responsibilities: db.select().from(arrangementResponsibilities).all(),
      };
      db.update(visits).set(lifecycle).where(eq(visits.id, visit.id)).run();
      db.update(journeys).set(lifecycle).where(eq(journeys.id, journey.id)).run();
      db.update(stays).set(lifecycle).where(eq(stays.id, stay.id)).run();
      db.update(events).set(lifecycle).where(eq(events.id, event.id)).run();
      db.update(rentals).set(lifecycle).where(eq(rentals.id, rental.id)).run();
      expect(listDocumentAssociations(db, tripId)).toEqual([tripAssociation]);
      expect(listResponsibilities(db, tripId)).toEqual([]);
      for (const target of documentTargets)
        expect(() => createDocumentAssociation(db, tripId, { documentId: 11, ...target })).toThrow(
          'not_found'
        );
      for (const association of documents)
        expect(() => deleteDocumentAssociation(db, tripId, association.id)).toThrow('not_found');
      for (const target of responsibilityTargets) {
        expect(() => getResponsibility(db, tripId, target.kind, target.id)).toThrow('not_found');
        expect(() =>
          replaceResponsibility(db, tripId, target, { expectedRevision: 1, responsibility: null })
        ).toThrow('not_found');
      }
      expect({
        documents: db.select().from(tripDocumentAssociations).all(),
        responsibilities: db.select().from(arrangementResponsibilities).all(),
      }).toEqual(history);
      const restored = { removedAt: null, removalOperationId: null, removalRevision: 2 };
      db.update(visits).set(restored).where(eq(visits.id, visit.id)).run();
      db.update(journeys).set(restored).where(eq(journeys.id, journey.id)).run();
      db.update(stays).set(restored).where(eq(stays.id, stay.id)).run();
      db.update(events).set(restored).where(eq(events.id, event.id)).run();
      db.update(rentals).set(restored).where(eq(rentals.id, rental.id)).run();
      expect(listDocumentAssociations(db, tripId)).toEqual([tripAssociation, ...documents]);
      expect(listResponsibilities(db, tripId)).toEqual(responsibilities);
    }));

  it('retains grouping rows while excluding archived alternatives and rejecting selection of them', () =>
    withCaptureDb((db) => {
      const tripId = createTrip(db, {}).id;
      const current = createJourney(db, tripId, {});
      const alternative = createJourney(db, tripId, {});
      const group = createJourneyGroup(db, tripId, {
        currentJourneyId: current.id,
        alternativeJourneyIds: [alternative.id],
      });
      db.update(journeys).set(lifecycle).where(eq(journeys.id, alternative.id)).run();
      expect(getJourneyGroup(db, tripId, group.id)).toEqual({
        ...group,
        alternativeJourneyIds: [],
      });
      expect(() =>
        selectJourneyAlternative(
          db,
          { tripId, id: group.id },
          { expectedRevision: 0, journeyId: alternative.id }
        )
      ).toThrow('not_found');
      expect(() => createJourneyGroup(db, tripId, { currentJourneyId: alternative.id })).toThrow(
        'not_found'
      );
      db.update(journeys).set(lifecycle).where(eq(journeys.id, current.id)).run();
      expect(listJourneyGroups(db, tripId)).toEqual([]);
      expect(() => getJourneyGroup(db, tripId, group.id)).toThrow('not_found');
      db.update(journeys)
        .set({ removedAt: null, removalOperationId: null, removalRevision: 2 })
        .run();
      expect(getJourneyGroup(db, tripId, group.id)).toEqual(group);
    }));

  it('keeps historical grouping ordinals when selecting or appending around an archived member', () =>
    withCaptureDb((db) => {
      const tripId = createTrip(db, {}).id;
      const current = createJourney(db, tripId, {});
      const archived = createJourney(db, tripId, {});
      const selected = createJourney(db, tripId, {});
      const group = createJourneyGroup(db, tripId, {
        currentJourneyId: current.id,
        alternativeJourneyIds: [archived.id, selected.id],
      });
      db.update(journeys).set(lifecycle).where(eq(journeys.id, archived.id)).run();
      selectJourneyAlternative(
        db,
        { tripId, id: group.id },
        { expectedRevision: 0, journeyId: selected.id }
      );
      const added = addBlankJourneyAlternative(db, { tripId, id: group.id }, 1);
      expect(
        db.select().from(journeyGroupMembers).where(eq(journeyGroupMembers.groupId, group.id)).all()
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ journeyId: selected.id, position: 0 }),
          expect.objectContaining({ journeyId: archived.id, position: 1 }),
          expect.objectContaining({ journeyId: current.id, position: 2 }),
          expect.objectContaining({ journeyId: added.journey.id, position: 3 }),
        ])
      );
      db.update(journeys)
        .set({ removedAt: null, removalOperationId: null, removalRevision: 2 })
        .where(eq(journeys.id, archived.id))
        .run();
      expect(getJourneyGroup(db, tripId, group.id).alternativeJourneyIds).toEqual([
        archived.id,
        current.id,
        added.journey.id,
      ]);
    }));
});

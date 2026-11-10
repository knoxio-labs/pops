import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import {
  createDocumentAssociation,
  deleteDocumentAssociation,
  listDocumentAssociations,
} from '../services/document-associations.js';
import { createEvent, deleteEvent } from '../services/events.js';
import { createJourney, deleteJourney } from '../services/journeys.js';
import { createPlace, createTrip, createVisit } from '../services/records.js';
import { TripsServiceError } from '../services/source-record.js';
import { createStay, deleteStay } from '../services/stays.js';

let opened: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'trip-document-associations-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('Trips document associations', () => {
  it('associates Documents identities with each supported explicit same-trip target and preserves originals on unlink', () => {
    const db = opened.db;
    const trip = createTrip(db, {});
    const otherTrip = createTrip(db, {});
    const place = createPlace(db, { name: 'Place' });
    const visit = createVisit(db, trip.id, { placeId: place.id });
    const journey = createJourney(db, trip.id, {});
    const stay = createStay(db, trip.id, {});
    const event = createEvent(db, trip.id, {});
    const links = [
      createDocumentAssociation(db, trip.id, {
        documentId: 41,
        targetKind: 'trip',
        targetId: trip.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 41,
        targetKind: 'visit',
        targetId: visit.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 41,
        targetKind: 'journey',
        targetId: journey.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 41,
        targetKind: 'stay',
        targetId: stay.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 41,
        targetKind: 'event',
        targetId: event.id,
      }),
    ];
    expect(listDocumentAssociations(db, trip.id)).toEqual(links);
    deleteDocumentAssociation(db, trip.id, links[1]!.id);
    expect(listDocumentAssociations(db, trip.id)).toEqual([links[0], links[2], links[3], links[4]]);
    expect(listDocumentAssociations(db, otherTrip.id)).toEqual([]);
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    expect(listDocumentAssociations(opened.db, trip.id)).toEqual([
      links[0],
      links[2],
      links[3],
      links[4],
    ]);
  });

  it('rejects duplicate links and targets outside the owning trip', () => {
    const db = opened.db;
    const trip = createTrip(db, {});
    const otherTrip = createTrip(db, {});
    const place = createPlace(db, { name: 'Place' });
    const foreignVisit = createVisit(db, otherTrip.id, { placeId: place.id });
    const foreignEvent = createEvent(db, otherTrip.id, {});
    const input = { documentId: 7, targetKind: 'trip' as const, targetId: trip.id };
    createDocumentAssociation(db, trip.id, input);
    expect(() => createDocumentAssociation(db, trip.id, input)).toThrowError(
      new TripsServiceError('association_exists')
    );
    expect(() =>
      createDocumentAssociation(db, trip.id, {
        documentId: 8,
        targetKind: 'visit',
        targetId: foreignVisit.id,
      })
    ).toThrowError(new TripsServiceError('not_found'));
    expect(() =>
      createDocumentAssociation(db, trip.id, {
        documentId: 8,
        targetKind: 'event',
        targetId: foreignEvent.id,
      })
    ).toThrowError(new TripsServiceError('not_found'));
    expect(() =>
      createDocumentAssociation(db, trip.id, {
        documentId: 8,
        targetKind: 'trip',
        targetId: otherTrip.id,
      })
    ).toThrowError(new TripsServiceError('association_invalid'));
  });

  it('rejects nonpositive and noninteger external document identities before writing', () => {
    const db = opened.db;
    const trip = createTrip(db, {});
    for (const documentId of [0, -1, 1.5, Number.NaN])
      expect(() =>
        createDocumentAssociation(db, 1, {
          documentId,
          targetKind: 'trip',
          targetId: trip.id,
        })
      ).toThrowError(new TripsServiceError('association_invalid'));
    expect(listDocumentAssociations(db, trip.id)).toEqual([]);
  });

  it('removes only deleted live-target memberships and rolls cleanup back when source deletion fails', () => {
    const db = opened.db;
    const trip = createTrip(db, {});
    const otherTrip = createTrip(db, {});
    const place = createPlace(db, { name: 'Place' });
    const visit = createVisit(db, trip.id, { placeId: place.id });
    const stay = createStay(db, trip.id, {});
    const otherStay = createStay(db, trip.id, {});
    const journey = createJourney(db, trip.id, {});
    const otherJourney = createJourney(db, trip.id, {});
    const event = createEvent(db, trip.id, {});
    const otherEvent = createEvent(db, trip.id, {});
    const associations = [
      createDocumentAssociation(db, trip.id, {
        documentId: 31,
        targetKind: 'stay',
        targetId: stay.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 31,
        targetKind: 'trip',
        targetId: trip.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 32,
        targetKind: 'stay',
        targetId: otherStay.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 33,
        targetKind: 'journey',
        targetId: journey.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 33,
        targetKind: 'visit',
        targetId: visit.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 34,
        targetKind: 'journey',
        targetId: otherJourney.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 35,
        targetKind: 'event',
        targetId: event.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 35,
        targetKind: 'trip',
        targetId: trip.id,
      }),
      createDocumentAssociation(db, trip.id, {
        documentId: 36,
        targetKind: 'event',
        targetId: otherEvent.id,
      }),
    ];

    expect(() =>
      createDocumentAssociation(db, trip.id, {
        documentId: 35,
        targetKind: 'event',
        targetId: event.id,
      })
    ).toThrowError(new TripsServiceError('association_exists'));

    expect(() => deleteStay(db, otherTrip.id, stay.id)).toThrowError(
      new TripsServiceError('not_found')
    );
    expect(listDocumentAssociations(db, trip.id)).toEqual(associations);

    opened.raw.exec(
      "CREATE TRIGGER reject_stay_delete BEFORE DELETE ON stays BEGIN SELECT RAISE(ABORT, 'rejected stay deletion'); END"
    );
    expect(() => deleteStay(db, trip.id, stay.id)).toThrow(/rejected stay deletion/);
    expect(listDocumentAssociations(db, trip.id)).toEqual(associations);
    opened.raw.exec('DROP TRIGGER reject_stay_delete');

    opened.raw.exec(
      "CREATE TRIGGER reject_journey_delete BEFORE DELETE ON journeys BEGIN SELECT RAISE(ABORT, 'rejected journey deletion'); END"
    );
    expect(() => deleteJourney(db, trip.id, journey.id)).toThrow(/rejected journey deletion/);
    expect(listDocumentAssociations(db, trip.id)).toEqual(associations);
    opened.raw.exec('DROP TRIGGER reject_journey_delete');

    opened.raw.exec(
      "CREATE TRIGGER reject_event_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'rejected event deletion'); END"
    );
    expect(() => deleteEvent(db, trip.id, event.id)).toThrow(/rejected event deletion/);
    expect(listDocumentAssociations(db, trip.id)).toEqual(associations);
    opened.raw.exec('DROP TRIGGER reject_event_delete');

    deleteStay(db, trip.id, stay.id);
    deleteJourney(db, trip.id, journey.id);
    deleteEvent(db, trip.id, event.id);
    expect(listDocumentAssociations(db, trip.id)).toEqual([
      associations[1],
      associations[2],
      associations[4],
      associations[5],
      associations[7],
      associations[8],
    ]);
  });
});

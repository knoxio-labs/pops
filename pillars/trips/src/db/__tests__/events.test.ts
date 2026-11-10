import { describe, expect, it } from 'vitest';

import { openTripsDb } from '../index.js';
import { events } from '../schema.js';
import { createEvent, deleteEvent, getEvent, listEvents, updateEvent } from '../services/events.js';
import {
  createPlace,
  createTrip,
  createVisit,
  getVisit,
  updateVisit,
} from '../services/records.js';

describe('Trip event persistence', () => {
  it('keeps date-only, contradictory and unavailable source facts independent of visits and purchase', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const place = createPlace(db, { name: 'Curitiba' });
      const visit = createVisit(db, trip.id, {
        placeId: place.id,
        timing: { arrival: '2027-12-14' },
      });
      const event = createEvent(db, trip.id, {
        visitId: visit.id,
        name: 'Birthday',
        intention: 'In plan',
        timing: { start: '2027-12-16' },
        organiserLinks: [{ uri: 'pops:contacts/entity/missing', label: 'Source person' }],
      });
      expect(event).toMatchObject({
        timing: { start: '2027-12-16' },
        arrangement: null,
        purchase: null,
        address: null,
        reference: null,
        sourceUrl: null,
        ticketUrl: null,
      });
      const bought = updateEvent(db, trip.id, event.id, {
        purchase: 'Purchased',
        timing: { start: '2028-02-10', end: '2028-02-01', endTime: '01:30' },
      });
      expect(bought).toMatchObject({
        intention: 'In plan',
        arrangement: null,
        purchase: 'Purchased',
        timing: { start: '2028-02-10', end: '2028-02-01', endTime: '01:30' },
      });
      updateVisit(db, trip.id, visit.id, { timing: {} });
      expect(getEvent(db, trip.id, event.id)).toEqual(bought);
      expect(getVisit(db, trip.id, visit.id).timing).toEqual({});
    } finally {
      opened.raw.close();
    }
  });

  it('preserves omitted values, replaces whole arrays/timing, and detaches without modifying source records', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const first = createEvent(db, trip.id, {
        name: 'Concert',
        arrangement: 'Booked',
        purchase: 'Purchased',
        timing: { start: '2028-01-02', startTime: '20:00', timeZone: 'America/Recife' },
        sourceUrl: 'https://example.test/programme',
        ticketUrl: 'https://example.test/tickets',
        documentLinks: [{ uri: 'pops:documents/document/42' }],
      });
      const second = createEvent(db, trip.id, {});
      expect(updateEvent(db, trip.id, first.id, { notes: 'Source note' })).toEqual({
        ...first,
        notes: 'Source note',
        updatedAt: expect.any(String),
      });
      const cleared = updateEvent(db, trip.id, first.id, {
        timing: {},
        name: null,
        purchase: null,
        ticketUrl: null,
        documentLinks: [],
      });
      expect(cleared).toMatchObject({
        timing: {},
        name: null,
        purchase: null,
        ticketUrl: null,
        documentLinks: [],
        arrangement: 'Booked',
        sourceUrl: first.sourceUrl,
        notes: 'Source note',
      });
      deleteEvent(db, trip.id, first.id);
      expect(listEvents(db, trip.id)).toEqual([second]);
      expect(() => getEvent(db, trip.id, first.id)).toThrow('not_found');
    } finally {
      opened.raw.close();
    }
  });

  it('rejects foreign and absent ownership atomically and enforces underlying foreign keys', () => {
    const opened = openTripsDb(':memory:');
    try {
      const db = opened.db;
      const trip = createTrip(db, {});
      const other = createTrip(db, {});
      const place = createPlace(db, { name: 'Source' });
      const foreign = createVisit(db, other.id, { placeId: place.id });
      const event = createEvent(db, trip.id, { notes: 'Retained' });
      for (const visitId of [foreign.id, 99999]) {
        expect(() => createEvent(db, trip.id, { visitId })).toThrow('not_found');
        expect(() => updateEvent(db, trip.id, event.id, { visitId, notes: 'Rejected' })).toThrow(
          'not_found'
        );
        expect(getEvent(db, trip.id, event.id)).toEqual(event);
      }
      expect(() => createEvent(db, 99999, {})).toThrow('not_found');
      expect(() => listEvents(db, 99999)).toThrow('not_found');
      expect(() => getEvent(db, other.id, event.id)).toThrow('not_found');
      expect(() => deleteEvent(db, other.id, event.id)).toThrow('not_found');
      expect(() => updateEvent(db, other.id, event.id, {})).toThrow('not_found');
      expect(() => db.insert(events).values({ tripId: 99999 }).run()).toThrow(/FOREIGN KEY/u);
      expect(listEvents(db, trip.id)).toEqual([event]);
    } finally {
      opened.raw.close();
    }
  });
});

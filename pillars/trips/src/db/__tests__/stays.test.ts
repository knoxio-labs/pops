import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { stays } from '../schema.js';
import {
  createPlace,
  createTrip,
  createVisit,
  getVisit,
  listVisits,
  updateVisit,
} from '../services/records.js';
import { createStay, deleteStay, getStay, listStays, updateStay } from '../services/stays.js';

let opened: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'stays-db-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const db = opened.db;
  const trip = createTrip(db, {});
  const other = createTrip(db, {});
  const place = createPlace(db, { name: 'Source place' });
  const visit = createVisit(db, trip.id, {
    placeId: place.id,
    timing: { arrival: '2028-06-01', departure: '2028-06-20' },
  });
  const foreignVisit = createVisit(db, other.id, { placeId: place.id });
  return { db, trip, other, visit, foreignVisit };
}

describe('Stay source persistence', () => {
  it('roundtrips independent source facts, contradictory timing and unavailable links across reopen', () => {
    const { db, trip, visit } = fixture();
    const source = createStay(db, trip.id, {
      name: 'Source stay',
      visitId: visit.id,
      kind: 'family',
      status: 'Agreed',
      timing: {
        arrival: '2028-11-05',
        departure: '2028-03-12',
        checkIn: '01:30',
        checkOut: '02:30',
        timeZone: 'America/Chicago',
      },
      address: 'Source address',
      reference: 'Source reference',
      notes: 'Verbatim source',
      sourceLinks: [{ uri: 'https://source.example' }],
      hostLinks: [{ uri: 'pops:contacts/person/unavailable', label: 'Source host' }],
      documentLinks: [{ uri: 'pops:documents/document/unavailable' }],
    });
    const blank = createStay(db, trip.id, {});
    expect(blank).toMatchObject({
      visitId: null,
      name: null,
      kind: null,
      status: null,
      timing: {},
      address: null,
      reference: null,
      notes: '',
      sourceLinks: [],
      hostLinks: [],
      documentLinks: [],
    });
    expect(listStays(db, trip.id)).toEqual([source, blank]);
    expect(listVisits(db, trip.id)).toEqual([visit]);
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    expect(getStay(opened.db, trip.id, source.id)).toEqual(source);
    expect(listStays(opened.db, trip.id)).toEqual([source, blank]);
  });

  it('preserves omissions, replaces complete timing/arrays and clears nullable facts independently', () => {
    const { db, trip, visit } = fixture();
    const source = createStay(db, trip.id, {
      visitId: visit.id,
      name: 'Source',
      kind: 'hotel',
      status: 'Purchased',
      address: 'Address',
      reference: 'REF',
      timing: { arrival: '2028-06-01', departure: '2028-06-20', checkIn: '15:00', timeZone: 'UTC' },
      sourceLinks: [{ uri: 'https://source.example' }],
      hostLinks: [{ uri: 'https://host.example' }],
      documentLinks: [{ uri: 'https://document.example' }],
    });
    const patched = updateStay(db, trip.id, source.id, { notes: 'Edited' });
    expect(patched).toEqual({ ...source, notes: 'Edited', updatedAt: expect.any(String) });
    expect(
      updateStay(db, trip.id, source.id, {
        timing: { departure: '2028-01-01' },
        status: 'Reserved',
      })
    ).toMatchObject({ timing: { departure: '2028-01-01' }, status: 'Reserved', visitId: visit.id });
    const cleared = updateStay(db, trip.id, source.id, {
      visitId: null,
      name: null,
      kind: null,
      status: null,
      address: null,
      reference: null,
      timing: {},
      hostLinks: [],
      documentLinks: [],
    });
    expect(cleared).toEqual({
      ...patched,
      visitId: null,
      name: null,
      kind: null,
      status: null,
      address: null,
      reference: null,
      timing: {},
      hostLinks: [],
      documentLinks: [],
      updatedAt: expect.any(String),
    });
    expect(getVisit(db, trip.id, visit.id)).toEqual(visit);
  });

  it('does not copy or constrain visit dates when linked, edited, relinked or detached', () => {
    const { db, trip, visit } = fixture();
    const blank = createStay(db, trip.id, { visitId: visit.id });
    expect(blank.timing).toEqual({});
    const source = updateStay(db, trip.id, blank.id, {
      timing: { arrival: '2020-01-01', checkOut: '23:59' },
    });
    updateVisit(db, trip.id, visit.id, { timing: {} });
    expect(getStay(db, trip.id, source.id)).toEqual(source);
    const anotherVisit = createVisit(db, trip.id, { placeId: visit.placeId });
    expect(updateStay(db, trip.id, source.id, { visitId: anotherVisit.id })).toMatchObject({
      timing: source.timing,
    });
    expect(updateStay(db, trip.id, source.id, { visitId: null })).toMatchObject({
      timing: source.timing,
    });
  });

  it('isolates trips and rejects missing/foreign references atomically on create and patch', () => {
    const { db, trip, other, visit, foreignVisit } = fixture();
    const source = createStay(db, trip.id, { visitId: visit.id, notes: 'Preserved' });
    for (const visitId of [99999, foreignVisit.id]) {
      expect(() => createStay(db, trip.id, { visitId })).toThrow('not_found');
      expect(() =>
        updateStay(db, trip.id, source.id, { visitId, notes: 'Must roll back' })
      ).toThrow('not_found');
      expect(getStay(db, trip.id, source.id)).toEqual(source);
      expect(listStays(db, trip.id)).toEqual([source]);
    }
    expect(() => createStay(db, 99999, {})).toThrow('not_found');
    expect(() => listStays(db, 99999)).toThrow('not_found');
    expect(() => getStay(db, other.id, source.id)).toThrow('not_found');
    expect(() => updateStay(db, other.id, source.id, { notes: 'Wrong trip' })).toThrow('not_found');
    expect(() => deleteStay(db, other.id, source.id)).toThrow('not_found');
    expect(() => updateStay(db, trip.id, 99999, {})).toThrow('not_found');
    expect(() => deleteStay(db, trip.id, 99999)).toThrow('not_found');
    expect(getStay(db, trip.id, source.id)).toEqual(source);
    expect(listStays(db, other.id)).toEqual([]);
  });

  it('deletes only the selected source record and preserves the remaining stays and visits', () => {
    const { db, trip, visit } = fixture();
    const first = createStay(db, trip.id, {
      visitId: visit.id,
      documentLinks: [{ uri: 'pops:documents/document/42' }],
    });
    const second = createStay(db, trip.id, { status: 'Purchased' });
    deleteStay(db, trip.id, first.id);
    const third = createStay(db, trip.id, {});
    expect(listStays(db, trip.id)).toEqual([second, third]);
    expect(listVisits(db, trip.id)).toEqual([visit]);
    expect(() => getStay(db, trip.id, first.id)).toThrow('not_found');
  });

  it('enforces trip and visit existence beneath the service layer', () => {
    const { db, trip } = fixture();
    expect(() => db.insert(stays).values({ tripId: 99999 }).run()).toThrow(/FOREIGN KEY/u);
    expect(() => db.insert(stays).values({ tripId: trip.id, visitId: 99999 }).run()).toThrow(
      /FOREIGN KEY/u
    );
  });
});

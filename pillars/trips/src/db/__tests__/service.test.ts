import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { visits } from '../schema.js';
import {
  createPlace,
  createTrip,
  createVisit,
  getPlace,
  getTrip,
  getVisit,
  listPlaces,
  listTrips,
  listVisits,
  reorderVisits,
  updatePlace,
  updateTrip,
  updateVisit,
} from '../services/records.js';

let opened: OpenedTripsDb;
let directory: string;

beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'trips-db-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const db = opened.db;
  const trip = createTrip(db, {});
  const place = createPlace(db, { name: 'Example city' });
  const first = createVisit(db, trip.id, {
    placeId: place.id,
    timing: { arrival: '2028-01-20' },
    notes: 'source note',
    sourceLinks: [{ uri: 'pops:documents/document/42' }],
  });
  const second = createVisit(db, trip.id, {
    placeId: place.id,
    timing: {
      month: { year: 2028, month: 2, part: 'early' },
      duration: { min: 2, max: 3, unit: 'weeks' },
    },
  });
  return { db, trip, place, first, second };
}

describe('Trips persistence and route invariants', () => {
  it('persists repeated place identities, absent timing and explicit source metadata across reopen', () => {
    const { db, trip, place, first, second } = fixture();
    const untimed = createVisit(db, trip.id, { placeId: place.id });
    expect(untimed.timing).toEqual({});
    expect(first.id).not.toBe(second.id);
    expect(listTrips(db)).toEqual([trip]);
    expect(listPlaces(db)).toEqual([place]);
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    expect(getTrip(opened.db, trip.id).name).toBeNull();
    expect(listVisits(opened.db, trip.id)).toEqual([first, second, untimed]);
  });

  it('reorders independently of dates and preserves all source values and timestamps', () => {
    const { db, trip, first, second } = fixture();
    expect(reorderVisits(db, trip.id, [second.id, first.id])).toEqual([
      { ...second, revision: 1 },
      { ...first, revision: 1 },
    ]);
    expect(listVisits(db, trip.id)).toEqual([
      { ...second, revision: 1 },
      { ...first, revision: 1 },
    ]);
  });

  it('rejects duplicate, missing, unknown and foreign visit IDs without partial mutation', () => {
    const { db, trip, place, first, second } = fixture();
    const other = createTrip(db, { name: 'Other trip' });
    const foreign = createVisit(db, other.id, { placeId: place.id });
    for (const ids of [
      [first.id, first.id],
      [second.id],
      [second.id, 99999],
      [second.id, foreign.id],
      [],
    ]) {
      expect(() => reorderVisits(db, trip.id, ids)).toThrow('order_invalid');
      expect(listVisits(db, trip.id)).toEqual([first, second]);
      expect(listVisits(db, other.id)).toEqual([foreign]);
    }
    expect(reorderVisits(db, createTrip(db, {}).id, [])).toEqual([]);
    expect(() => reorderVisits(db, 99999, [])).toThrow('not_found');
  });

  it('patches supplied metadata, clears timing explicitly and never copies another visit timing', () => {
    const { db, trip, place, first, second } = fixture();
    updateTrip(db, trip.id, {
      name: 'Named trip',
      notes: 'verbatim',
      sourceLinks: [{ uri: 'https://source.example/a', label: 'Source' }],
    });
    const renamed = updateTrip(db, trip.id, { name: null });
    expect(renamed).toMatchObject({
      name: null,
      notes: 'verbatim',
      sourceLinks: [{ uri: 'https://source.example/a', label: 'Source' }],
    });
    expect(updateVisit(db, trip.id, first.id, { timing: {} })).toMatchObject({
      ...first,
      timing: {},
      revision: 1,
      updatedAt: expect.any(String),
    });
    updatePlace(db, place.id, { name: 'Updated city' });
    expect(getPlace(db, place.id).name).toBe('Updated city');
    expect(getVisit(db, trip.id, second.id)).toEqual(second);
  });

  it('rejects missing references and access through another trip without mutating rows', () => {
    const { db, trip, place, first } = fixture();
    const other = createTrip(db, {});
    expect(() => createVisit(db, trip.id, { placeId: 99999 })).toThrow('not_found');
    expect(() => createVisit(db, 99999, { placeId: place.id })).toThrow('not_found');
    expect(() => getVisit(db, other.id, first.id)).toThrow('not_found');
    expect(() => updateVisit(db, other.id, first.id, { notes: 'wrong trip' })).toThrow('not_found');
    expect(() => updateVisit(db, trip.id, first.id, { placeId: 99999 })).toThrow('not_found');
    expect(() => updateTrip(db, 99999, {})).toThrow('not_found');
    expect(() => updatePlace(db, 99999, {})).toThrow('not_found');
    expect(getVisit(db, trip.id, first.id)).toEqual(first);
    expect(listVisits(db, trip.id)).toHaveLength(2);
  });

  it('enforces owned-reference foreign keys beneath the service layer', () => {
    const { db, trip, place } = fixture();
    expect(() =>
      db.insert(visits).values({ tripId: 99999, placeId: place.id, position: 0 }).run()
    ).toThrow(/FOREIGN KEY/u);
    expect(() =>
      db.insert(visits).values({ tripId: trip.id, placeId: 99999, position: 0 }).run()
    ).toThrow(/FOREIGN KEY/u);
  });
});

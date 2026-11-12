import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { journeys, journeyLegs } from '../schema.js';
import {
  createJourneyLeg,
  deleteJourneyLeg,
  getJourneyLeg,
  listJourneyLegs,
  reorderJourneyLegs,
  updateJourneyLeg,
} from '../services/journey-legs.js';
import {
  createJourney,
  deleteJourney,
  getJourney,
  listJourneys,
  updateJourney,
} from '../services/journeys.js';
import { requireLegRevision } from '../services/leg-revision.js';
import { createPlace, createTrip, createVisit, listVisits } from '../services/records.js';

let opened: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'journeys-db-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const db = opened.db;
  const trip = createTrip(db, {});
  const place = createPlace(db, { name: 'Manually selected place' });
  const visit = createVisit(db, trip.id, { placeId: place.id, timing: { arrival: '2028-02-02' } });
  const journey = createJourney(db, trip.id, {
    name: 'Source journey',
    reference: 'SOURCE',
    buffers: { minimumConnectionMinutes: 42 },
    sourceLinks: [{ uri: 'pops:documents/document/unavailable' }],
  });
  const first = createJourneyLeg(db, trip.id, journey.id, {
    mode: 'Fictional transport',
    from: { placeId: place.id, local: '2028-02-02T11:00', timeZone: 'UTC' },
    to: {
      sourceLabel: 'Source destination',
      local: '2028-02-01T10:00',
      timeZone: 'America/Chicago',
      sourceLinks: [{ uri: 'https://source.example' }],
    },
    intention: 'Alternative',
    arrangement: 'Agreed',
    purchase: 'Purchased',
    reference: 'LEG-1',
    operator: 'Source operator',
    service: 'Source service',
    notes: 'verbatim source',
    sourceLinks: [{ uri: 'pops:documents/document/42' }],
  });
  const second = createJourneyLeg(db, trip.id, journey.id, { arrangement: 'Booked' });
  return { db, trip, place, visit, journey, first, second };
}

describe('Journey source persistence', () => {
  it('preserves a known day through old-client stripping and full endpoint replacement across reopen', () => {
    const { db, trip, journey } = fixture();
    const source = createJourneyLeg(db, trip.id, journey.id, {
      from: { date: '2028-02-29', sourceLabel: 'Original', timeZone: 'Pacific/Kiritimati' },
      to: { date: '2028-03-01' },
    });
    const legacyEndpoint = z.object({
      sourceLabel: z.string().optional(),
      local: z.string().optional(),
      timeZone: z.string().optional(),
    });
    const stripped = legacyEndpoint.parse(source.from);
    expect(stripped).toEqual({ sourceLabel: 'Original', timeZone: 'Pacific/Kiritimati' });
    const identity = { tripId: trip.id, journeyId: journey.id, id: source.id };
    expect(
      updateJourneyLeg(db, identity, { from: { ...stripped, sourceLabel: 'Old writer' } }).from
    ).toEqual({ date: '2028-02-29', sourceLabel: 'Old writer', timeZone: 'Pacific/Kiritimati' });
    expect(
      updateJourneyLeg(db, identity, { from: {}, notes: 'Old empty replacement' }).from
    ).toEqual({ date: '2028-02-29' });
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    expect(getJourneyLeg(opened.db, trip.id, journey.id, source.id)).toMatchObject({
      from: { date: '2028-02-29' },
      to: { date: '2028-03-01' },
      notes: 'Old empty replacement',
    });
  });

  it('changes precision explicitly and rolls back rejected or stale writes without advancing revision', () => {
    const { db, trip, journey, first } = fixture();
    const identity = { tripId: trip.id, journeyId: journey.id, id: first.id };
    const day = updateJourneyLeg(db, identity, { from: { date: '2028-02-29' } });
    expect(day.from).toEqual({ date: '2028-02-29' });
    const revision = requireLegRevision(db, identity);
    expect(() =>
      updateJourneyLeg(db, identity, {
        expectedRevision: revision - 1,
        from: { date: null },
        notes: 'stale',
      })
    ).toThrow('leg_revision_conflict');
    expect(() =>
      updateJourneyLeg(db, identity, {
        expectedRevision: revision,
        from: { date: '2028-02-29', local: '2028-02-29T12:30' },
        notes: 'invalid',
      })
    ).toThrow();
    expect(getJourneyLeg(db, trip.id, journey.id, first.id)).toEqual(day);
    expect(requireLegRevision(db, identity)).toBe(revision);
    expect(
      updateJourneyLeg(db, identity, { from: { date: null }, expectedRevision: revision }).from
    ).toEqual({});
    updateJourneyLeg(db, identity, { from: { date: '2028-02-29' } });
    expect(
      updateJourneyLeg(db, identity, { from: { local: '2028-03-01T11:22:33.123456789' } }).from
    ).toEqual({ local: '2028-03-01T11:22:33.123456789' });
    expect(
      updateJourneyLeg(db, identity, { from: { date: null, local: '2028-03-02T12:30' } }).from
    ).toEqual({ local: '2028-03-02T12:30' });
  });
  it('roundtrips independent source facts, partial legs and unavailable remote links across reopen', () => {
    const { db, trip, journey, first, second } = fixture();
    expect(second).toMatchObject({
      mode: null,
      from: {},
      to: {},
      arrangement: 'Booked',
      purchase: null,
      intention: null,
    });
    const blank = createJourney(db, trip.id, {});
    expect(blank).toMatchObject({
      name: null,
      reference: null,
      buffers: {},
      sourceLinks: [],
      notes: '',
    });
    expect(listJourneys(db, trip.id)).toEqual([journey, blank]);
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    expect(getJourney(opened.db, trip.id, journey.id)).toEqual(journey);
    expect(listJourneyLegs(opened.db, trip.id, journey.id)).toEqual([first, second]);
  });

  it('reorders even reversed chronology without changing source facts, purchase, timestamps or visit route', () => {
    const { db, trip, journey, first, second, visit } = fixture();
    expect(reorderJourneyLegs(db, trip.id, journey.id, [second.id, first.id])).toEqual([
      second,
      first,
    ]);
    expect(listVisits(db, trip.id)).toEqual([visit]);
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([second, first]);
  });

  it('rejects missing, duplicated, unknown and foreign permutation members atomically', () => {
    const { db, trip, journey, first, second } = fixture();
    const other = createJourney(db, trip.id, {});
    const foreign = createJourneyLeg(db, trip.id, other.id, {});
    for (const ids of [
      [first.id, first.id],
      [second.id],
      [first.id, 99999],
      [second.id, foreign.id],
      [],
    ]) {
      expect(() => reorderJourneyLegs(db, trip.id, journey.id, ids)).toThrow('order_invalid');
      expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([first, second]);
      expect(listJourneyLegs(db, trip.id, other.id)).toEqual([foreign]);
    }
    expect(reorderJourneyLegs(db, trip.id, createJourney(db, trip.id, {}).id, [])).toEqual([]);
  });

  it('patches only selected fields, clears nullable choices explicitly and replaces endpoints/configuration', () => {
    const { db, trip, journey, first, second } = fixture();
    expect(updateJourney(db, trip.id, journey.id, { name: null, buffers: {} })).toMatchObject({
      ...journey,
      name: null,
      buffers: {},
      updatedAt: expect.any(String),
    });
    const updated = updateJourneyLeg(
      db,
      { tripId: trip.id, journeyId: journey.id, id: first.id },
      {
        from: {},
        purchase: null,
        reference: null,
      }
    );
    expect(updated).toEqual({
      ...first,
      from: {},
      purchase: null,
      reference: null,
      updatedAt: expect.any(String),
    });
    expect(
      updateJourneyLeg(
        db,
        { tripId: trip.id, journeyId: journey.id, id: first.id },
        { arrangement: 'Booked' }
      )
    ).toMatchObject({ purchase: null, intention: 'Alternative', from: {}, to: first.to });
    expect(getJourneyLeg(db, trip.id, journey.id, second.id)).toEqual(second);
  });

  it('isolates trips and journeys and rejects missing place links without partial writes', () => {
    const { db, trip, journey, first, second } = fixture();
    const otherTrip = createTrip(db, {});
    const other = createJourney(db, otherTrip.id, {});
    expect(() => createJourney(db, 99999, {})).toThrow('not_found');
    expect(() => listJourneys(db, 99999)).toThrow('not_found');
    expect(() => getJourney(db, otherTrip.id, journey.id)).toThrow('not_found');
    expect(() => updateJourney(db, otherTrip.id, journey.id, { notes: 'wrong' })).toThrow(
      'not_found'
    );
    expect(() => createJourneyLeg(db, trip.id, other.id, {})).toThrow('not_found');
    expect(() => getJourneyLeg(db, otherTrip.id, other.id, first.id)).toThrow('not_found');
    expect(() => createJourneyLeg(db, trip.id, journey.id, { from: { placeId: 99999 } })).toThrow(
      'not_found'
    );
    expect(() =>
      updateJourneyLeg(
        db,
        { tripId: trip.id, journeyId: journey.id, id: first.id },
        { to: { placeId: 99999 } }
      )
    ).toThrow('not_found');
    expect(() =>
      updateJourneyLeg(db, { tripId: otherTrip.id, journeyId: journey.id, id: first.id }, {})
    ).toThrow('not_found');
    expect(() => reorderJourneyLegs(db, otherTrip.id, journey.id, [second.id, first.id])).toThrow(
      'not_found'
    );
    expect(() => deleteJourney(db, otherTrip.id, journey.id)).toThrow('not_found');
    expect(() => deleteJourneyLeg(db, otherTrip.id, other.id, first.id)).toThrow('not_found');
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([first, second]);
  });

  it('removes only explicit source records and appends after deletion without corrupting remaining order', () => {
    const { db, trip, journey, first, second, visit } = fixture();
    deleteJourneyLeg(db, trip.id, journey.id, first.id);
    const third = createJourneyLeg(db, trip.id, journey.id, { mode: 'walking' });
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual([second, third]);
    const other = createJourney(db, trip.id, {});
    const untouched = createJourneyLeg(db, trip.id, other.id, {});
    deleteJourney(db, trip.id, journey.id);
    expect(() => getJourney(db, trip.id, journey.id)).toThrow('not_found');
    expect(listJourneyLegs(db, trip.id, other.id)).toEqual([untouched]);
    expect(db.select().from(journeyLegs).all()).toHaveLength(1);
    expect(listVisits(db, trip.id)).toEqual([visit]);
    expect(() => deleteJourneyLeg(db, trip.id, other.id, first.id)).toThrow('not_found');
  });

  it('enforces trip and journey foreign keys beneath the service layer', () => {
    expect(() => opened.db.insert(journeys).values({ tripId: 99999 }).run()).toThrow(
      /FOREIGN KEY/u
    );
    expect(() =>
      opened.db.insert(journeyLegs).values({ journeyId: 99999, position: 0 }).run()
    ).toThrow(/FOREIGN KEY/u);
  });
});

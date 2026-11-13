import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { journeys, journeyLegs } from '../schema.js';
import { getJourneyGroup } from '../services/journey-group-queries.js';
import { createJourneyGroup } from '../services/journey-groups.js';
import { createJourneyLeg, listJourneyLegs, reorderJourneyLegs } from '../services/journey-legs.js';
import { getJourneyTiming } from '../services/journey-timing.js';
import { createJourney, getJourney } from '../services/journeys.js';
import { createPlace, createTrip, createVisit, listVisits } from '../services/records.js';

let opened: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'journey-timing-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const db = opened.db;
  const trip = createTrip(db, {});
  const place = createPlace(db, { name: 'Explicit source place' });
  const visit = createVisit(db, trip.id, { placeId: place.id });
  const journey = createJourney(db, trip.id, {
    buffers: { minimumConnectionMinutes: 999, airportBufferMinutes: 999 },
    sourceLinks: [{ uri: 'pops:documents/document/unavailable' }],
  });
  const first = createJourneyLeg(db, trip.id, journey.id, {
    mode: 'Source transport',
    purchase: 'Purchased',
    arrangement: 'Agreed',
    from: { local: '2028-01-15T10:00', timeZone: 'Australia/Sydney', placeId: place.id },
    to: { local: '2028-01-15T08:15', timeZone: 'America/Chicago' },
    reference: 'Original source',
    notes: 'Original notes',
  });
  const second = createJourneyLeg(db, trip.id, journey.id, {
    from: { local: '2028-01-15T11:00', timeZone: 'America/Chicago' },
    to: { local: '2028-01-16T00:30', timeZone: 'America/Sao_Paulo' },
  });
  const group = createJourneyGroup(db, trip.id, { currentJourneyId: journey.id });
  db.update(journeys)
    .set({ updatedAt: '2000-01-01T00:00:00Z' })
    .where(eq(journeys.id, journey.id))
    .run();
  db.update(journeyLegs)
    .set({ updatedAt: '2001-01-01T00:00:00Z' })
    .where(eq(journeyLegs.journeyId, journey.id))
    .run();
  return { db, trip, visit, journey, first, second, group };
}

describe('Persisted journey timing projection', () => {
  it('reads a consistent source snapshot without writing source facts, timestamps, route or selection', () => {
    const { db, trip, journey, visit, group } = fixture();
    const sourceJourney = getJourney(db, trip.id, journey.id);
    const sourceLegs = listJourneyLegs(db, trip.id, journey.id);
    const timing = getJourneyTiming(db, trip.id, journey.id);
    expect(timing.legs.map((leg) => leg.elapsedMinutes)).toEqual([915, 630]);
    expect(timing.connections[0]?.availableMinutes).toBe(165);
    expect(timing.findings).toEqual([]);
    expect(getJourneyTiming(db, trip.id, journey.id)).toEqual(timing);
    expect(getJourney(db, trip.id, journey.id)).toEqual(sourceJourney);
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual(sourceLegs);
    expect(listVisits(db, trip.id)).toEqual([visit]);
    expect(getJourneyGroup(db, trip.id, group.id)).toEqual(group);
  });

  it('recalculates source-order conflicts without correcting source clocks or purchase facts', () => {
    const { db, trip, journey, first, second } = fixture();
    const sources = listJourneyLegs(db, trip.id, journey.id);
    const reordered = reorderJourneyLegs(db, trip.id, journey.id, [second.id, first.id]);
    const timing = getJourneyTiming(db, trip.id, journey.id);
    expect(timing.legs.map((leg) => leg.legId)).toEqual([second.id, first.id]);
    expect(timing.findings).toMatchObject([
      { code: 'departure_before_previous_arrival', legIds: [second.id, first.id] },
    ]);
    expect(timing.connections[0]?.availableMinutes).toBeLessThan(0);
    expect(reordered).toEqual(sources.toReversed());
    expect(listJourneyLegs(db, trip.id, journey.id)).toEqual(reordered);
  });

  it('retains unknown and ambiguous source clocks across reopen without manufacturing times or conflicts for absent fields', () => {
    const db = opened.db;
    const trip = createTrip(db, {});
    const journey = createJourney(db, trip.id, {});
    const first = createJourneyLeg(db, trip.id, journey.id, {
      from: { local: '2028-03-12T02:30', timeZone: 'America/Chicago' },
      to: { local: '2028-11-05T01:30', timeZone: 'America/Chicago' },
      purchase: 'Purchased',
    });
    const second = createJourneyLeg(db, trip.id, journey.id, {});
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    const timing = getJourneyTiming(opened.db, trip.id, journey.id);
    expect(timing.legs).toEqual([
      {
        legId: first.id,
        departure: null,
        arrival: null,
        elapsedMinutes: null,
        departureSource: { date: '2028-03-12', precision: 'local' },
        arrivalSource: { date: '2028-11-05', precision: 'local' },
      },
      {
        legId: second.id,
        departure: null,
        arrival: null,
        elapsedMinutes: null,
        departureSource: { date: null, precision: 'unknown' },
        arrivalSource: { date: null, precision: 'unknown' },
      },
    ]);
    expect(timing.connections[0]?.availableMinutes).toBeNull();
    expect(timing.window).toBeNull();
    expect(timing.findings.map((finding) => finding.endpoint)).toEqual(['from', 'to']);
    expect(listJourneyLegs(opened.db, trip.id, journey.id)).toEqual([first, second]);
  });

  it('requires owned trip/journey identities and supports existing empty journeys', () => {
    const { db, trip, journey } = fixture();
    const other = createTrip(db, {});
    expect(() => getJourneyTiming(db, other.id, journey.id)).toThrow('not_found');
    expect(() => getJourneyTiming(db, trip.id, 99999)).toThrow('not_found');
    expect(() => getJourneyTiming(db, 99999, journey.id)).toThrow('not_found');
    const empty = createJourney(db, trip.id, {});
    expect(getJourneyTiming(db, trip.id, empty.id)).toEqual({
      journeyId: empty.id,
      legs: [],
      connections: [],
      window: null,
      findings: [],
    });
  });
});

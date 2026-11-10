import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { deriveJourneyTiming } from '../../domain/journey-timing.js';
import { openTripsDb } from '../index.js';
import * as schema from '../schema.js';
import { createJourneyLeg, updateJourneyLeg } from '../services/journey-legs.js';
import { getJourneyWorkspace } from '../services/journey-workspace.js';
import { createJourney, updateJourney } from '../services/journeys.js';
import { removeJourneyLeg, restoreJourneyLeg } from '../services/leg-removals.js';
import { getJourneyLegSet } from '../services/leg-set.js';
import { createTrip } from '../services/records.js';

import type { OpenedTripsDb } from '../index.js';

let opened: OpenedTripsDb;
let writer: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'journey-workspace-'));
  opened = openTripsDb(join(directory, 'trips.db'));
  writer = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  writer.raw.close();
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

it('keeps metadata, legs and derived timing in the same SQLite snapshot across a concurrent commit', () => {
  const trip = createTrip(opened.db, {});
  const journey = createJourney(opened.db, trip.id, { name: 'Original source' });
  const leg = createJourneyLeg(opened.db, trip.id, journey.id, {
    from: { local: '2029-02-01T20:30', timeZone: 'Pacific/Auckland' },
    to: { local: '2029-02-02T01:00', timeZone: 'Pacific/Auckland' },
  });
  let reads = 0;
  const db = drizzle(opened.raw, {
    schema,
    logger: {
      logQuery(query: string): void {
        if (!query.startsWith('select') || ++reads !== 2) return;
        updateJourney(writer.db, trip.id, journey.id, { name: 'Concurrent source' });
        updateJourneyLeg(
          writer.db,
          { tripId: trip.id, journeyId: journey.id, id: leg.id },
          { from: { local: '2029-02-03T20:30', timeZone: 'Pacific/Auckland' } }
        );
      },
    },
  });
  const snapshot = getJourneyWorkspace(db, trip.id, journey.id);
  expect(reads).toBeGreaterThanOrEqual(2);
  expect(snapshot).toEqual({
    journey,
    legs: [leg],
    timing: deriveJourneyTiming(journey.id, [leg]),
  });
  const latest = getJourneyWorkspace(writer.db, trip.id, journey.id);
  expect(latest.journey.name).toBe('Concurrent source');
  expect(latest.legs[0]?.from.local).toBe('2029-02-03T20:30');
  expect(latest.timing.findings).toMatchObject([{ code: 'arrival_before_departure' }]);
});

it('rejects foreign or missing identities and returns an existing empty source without fabricated timing', () => {
  const trip = createTrip(opened.db, {});
  const foreign = createTrip(opened.db, {});
  const journey = createJourney(opened.db, trip.id, {});
  expect(() => getJourneyWorkspace(opened.db, foreign.id, journey.id)).toThrow('not_found');
  expect(() => getJourneyWorkspace(opened.db, trip.id, 99999)).toThrow('not_found');
  expect(getJourneyWorkspace(opened.db, trip.id, journey.id)).toEqual({
    journey,
    legs: [],
    timing: { journeyId: journey.id, legs: [], connections: [], window: null, findings: [] },
  });
});

it('projects only live source membership and restores the same leg timing after Undo', () => {
  const trip = createTrip(opened.db, {});
  const journey = createJourney(opened.db, trip.id, {});
  const leg = createJourneyLeg(opened.db, trip.id, journey.id, {
    from: { local: '2029-02-01T20:30', timeZone: 'Pacific/Auckland' },
    to: { local: '2029-02-02T01:00', timeZone: 'Pacific/Auckland' },
  });
  const owner = { tripId: trip.id, journeyId: journey.id };
  const operationId = randomUUID();
  const removed = removeJourneyLeg(
    opened.db,
    { ...owner, id: leg.id },
    {
      operationId,
      expectedRevision: getJourneyLegSet(opened.db, trip.id, journey.id).revision,
    }
  );
  const snapshot = getJourneyWorkspace(opened.db, trip.id, journey.id);
  expect(snapshot.legs).toEqual([]);
  expect(snapshot.timing).toEqual(deriveJourneyTiming(journey.id, []));
  restoreJourneyLeg(opened.db, { ...owner, operationId }, removed.revision);
  const restored = getJourneyWorkspace(opened.db, trip.id, journey.id);
  expect(restored.legs).toEqual([leg]);
  expect(restored.timing).toEqual(deriveJourneyTiming(journey.id, [leg]));
});

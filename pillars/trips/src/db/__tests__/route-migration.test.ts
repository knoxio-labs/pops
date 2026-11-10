import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';

import { TripSchema, VisitSchema } from '../../contract/schemas.js';
import { openTripsDb } from '../index.js';
import * as schema from '../schema.js';
import { createJourney, getJourney } from '../services/journeys.js';
import { getTrip, listVisits } from '../services/records.js';
import { operateTripRoute } from '../services/route-operations.js';
import { getTripRoute } from '../services/route-queries.js';
import { migrationsBefore } from './migration-test-utils.js';

it('upgrades actual Visit order without inferring Journey placement, persists UUID/Undo proof and guards an independent connection', () => {
  const root = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'route-upgrade-'));
  const path = join(directory, 'trips.db');
  const raw = new Database(path);
  try {
    const db = drizzle(raw, { schema });
    migrate(db, { migrationsFolder: migrationsBefore(directory, '_flat_route_paths') });
    const trip = TripSchema.parse(
      db.insert(schema.trips).values({ name: 'Historical trip' }).returning().get()
    );
    const empty = TripSchema.parse(db.insert(schema.trips).values({}).returning().get());
    const place = db.insert(schema.places).values({ name: 'Repeated city' }).returning().get();
    if (place === undefined) throw new Error('Expected place');
    const first = VisitSchema.parse(
      db
        .insert(schema.visits)
        .values({
          tripId: trip.id,
          placeId: place.id,
          position: 8,
          timing: { departure: '2028-01-01' },
        })
        .returning()
        .get()
    );
    const second = VisitSchema.parse(
      db
        .insert(schema.visits)
        .values({
          tripId: trip.id,
          placeId: place.id,
          position: 2,
          timing: { arrival: '2029-01-01' },
        })
        .returning()
        .get()
    );
    const journey = createJourney(db, trip.id, {
      name: 'Earlier dated transport is still unplaced',
    });
    raw.close();
    const upgraded = openTripsDb(path);
    const operation = {
      operationId: randomUUID(),
      expectedRevision: 0,
      command: { kind: 'gap.create', before: null },
    } as const;
    let receipt;
    try {
      expect(getTrip(upgraded.db, trip.id)).toEqual(trip);
      expect(getTripRoute(upgraded.db, trip.id)).toEqual({
        tripId: trip.id,
        revision: 0,
        order: [
          { kind: 'visit', id: second.id },
          { kind: 'visit', id: first.id },
        ],
        paths: [],
        missingSources: [],
      });
      expect(getTripRoute(upgraded.db, empty.id)).toEqual({
        tripId: empty.id,
        revision: 0,
        order: [],
        paths: [],
        missingSources: [],
      });
      expect(listVisits(upgraded.db, trip.id)).toEqual([second, first]);
      expect(getJourney(upgraded.db, trip.id, journey.id)).toEqual(journey);
      receipt = operateTripRoute(upgraded.db, trip.id, operation).receipt;
    } finally {
      upgraded.raw.close();
    }
    const reopened = openTripsDb(path);
    const competing = openTripsDb(path);
    try {
      const replay = operateTripRoute(reopened.db, trip.id, operation);
      expect(replay).toMatchObject({ receipt, replayed: true });
      expect(() =>
        operateTripRoute(competing.db, trip.id, { ...operation, operationId: randomUUID() })
      ).toThrow('route_revision_conflict');
      expect(getTripRoute(reopened.db, trip.id).order).toEqual(receipt.after.order);
      const undone = operateTripRoute(competing.db, trip.id, {
        operationId: randomUUID(),
        expectedRevision: receipt.after.revision,
        command: { kind: 'undo', targetOperationId: operation.operationId },
      });
      expect(undone.current.order).toEqual(receipt.before.order);
      expect(operateTripRoute(reopened.db, trip.id, operation)).toMatchObject({
        receipt,
        replayed: true,
        undone: true,
        current: undone.current,
      });
      expect(listVisits(reopened.db, trip.id)).toEqual([second, first]);
    } finally {
      reopened.raw.close();
      competing.raw.close();
    }
  } finally {
    if (raw.open) raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

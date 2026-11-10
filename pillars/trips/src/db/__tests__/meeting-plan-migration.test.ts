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
import { getMeetingPlan } from '../services/meeting-plan-queries.js';
import { operateMeetingPlan } from '../services/meeting-plans.js';
import { createPlace, getTrip, listVisits } from '../services/records.js';
import { readSourceWorkspace } from '../services/source-queries.js';
import { send as operateCapture } from './capture-test-utils.js';
import { migrationsBefore } from './migration-test-utils.js';

import type { MeetingPlanReceipt } from '../../contract/meeting-plan-schemas.js';

it('upgrades an existing trip database without changing its route and persists receipts across reopening', () => {
  const root = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'meeting-plan-upgrade-'));
  const path = join(directory, 'trips.db');
  const raw = new Database(path);
  try {
    const db = drizzle(raw, { schema });
    migrate(db, { migrationsFolder: migrationsBefore(directory, '_meeting_plan_sources') });
    const trip = TripSchema.parse(
      db.insert(schema.trips).values({ name: 'Retained' }).returning().get()
    );
    const place = createPlace(db, { name: 'Repeated town' });
    const first = VisitSchema.parse(
      db
        .insert(schema.visits)
        .values({ tripId: trip.id, placeId: place.id, position: 0 })
        .returning()
        .get()
    );
    const second = VisitSchema.parse(
      db
        .insert(schema.visits)
        .values({ tripId: trip.id, placeId: place.id, position: 1 })
        .returning()
        .get()
    );
    const route = [first, second];
    const captureOperationId = randomUUID();
    const captureCommand = {
      kind: 'capture.create',
      input: { originalText: 'Retained capture source', visitId: second.id },
      explore: true,
    } as const;
    const captureReceipt = operateCapture(db, trip.id, captureCommand, captureOperationId).receipt;
    const captured = readSourceWorkspace(db, trip.id);
    raw.close();
    const upgraded = openTripsDb(path);
    const operation = {
      operationId: randomUUID(),
      command: {
        kind: 'create',
        input: { contactUri: 'pops:contacts/contact/retained', visitId: second.id },
      },
    } as const;
    let receipt: MeetingPlanReceipt;
    try {
      expect(getTrip(upgraded.db, trip.id)).toEqual(trip);
      expect(listVisits(upgraded.db, trip.id)).toEqual(route);
      expect(readSourceWorkspace(upgraded.db, trip.id)).toEqual(captured);
      expect(
        operateCapture(upgraded.db, trip.id, captureCommand, captureOperationId)
      ).toMatchObject({
        receipt: captureReceipt,
        replayed: true,
      });
      receipt = operateMeetingPlan(
        upgraded.db,
        trip.id,
        operation,
        operation.command.input.contactUri
      ).receipt;
    } finally {
      upgraded.raw.close();
    }
    const reopened = openTripsDb(path);
    try {
      expect(getMeetingPlan(reopened.db, trip.id, receipt.after.id)).toEqual(receipt.after);
      expect(operateMeetingPlan(reopened.db, trip.id, operation).receipt).toEqual(receipt);
      expect(listVisits(reopened.db, trip.id)).toEqual(route);
      expect(readSourceWorkspace(reopened.db, trip.id)).toEqual(captured);
      expect(
        operateCapture(reopened.db, trip.id, captureCommand, captureOperationId)
      ).toMatchObject({
        receipt: captureReceipt,
        replayed: true,
      });
    } finally {
      reopened.raw.close();
    }
  } finally {
    if (raw.open) raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

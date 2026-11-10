import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { expect, it } from 'vitest';
import { z } from 'zod';

import { openTripsDb } from '../index.js';
import * as schema from '../schema.js';
import { getMeetingPlan } from '../services/meeting-plan-queries.js';
import { operateMeetingPlan } from '../services/meeting-plans.js';
import { createPlace, createTrip, createVisit, getTrip, listVisits } from '../services/records.js';
import { readSourceWorkspace } from '../services/source-queries.js';
import { send as operateCapture } from './capture-test-utils.js';

import type { MeetingPlanReceipt } from '../../contract/meeting-plan-schemas.js';

const migrations = fileURLToPath(new URL('../../../migrations/', import.meta.url));
function previousMigrations(directory: string): string {
  const journal = z
    .object({
      version: z.string(),
      dialect: z.string(),
      entries: z.array(
        z.object({
          idx: z.number(),
          version: z.string(),
          when: z.number(),
          tag: z.string(),
          breakpoints: z.boolean(),
        })
      ),
    })
    .parse(JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')));
  const index = journal.entries.findIndex((entry) => entry.tag.endsWith('_meeting_plan_sources'));
  expect(index).toBeGreaterThan(0);
  const previous = join(directory, 'migrations');
  mkdirSync(join(previous, 'meta'), { recursive: true });
  const entries = journal.entries.slice(0, index);
  for (const entry of entries)
    copyFileSync(join(migrations, `${entry.tag}.sql`), join(previous, `${entry.tag}.sql`));
  writeFileSync(join(previous, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  return previous;
}

it('upgrades an existing trip database without changing its route and persists receipts across reopening', () => {
  const root = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'meeting-plan-upgrade-'));
  const path = join(directory, 'trips.db');
  const raw = new Database(path);
  try {
    const db = drizzle(raw, { schema });
    migrate(db, { migrationsFolder: previousMigrations(directory) });
    const trip = createTrip(db, { name: 'Retained' });
    const place = createPlace(db, { name: 'Repeated town' });
    createVisit(db, trip.id, { placeId: place.id });
    const second = createVisit(db, trip.id, { placeId: place.id });
    const route = listVisits(db, trip.id);
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

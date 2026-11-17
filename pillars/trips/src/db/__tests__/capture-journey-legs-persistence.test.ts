import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { openTripsDb } from '../index.js';
import { journeyLegs, sourceOperations } from '../schema.js';
import { listJourneys } from '../services/journeys.js';
import { createTrip } from '../services/records.js';
import { send } from './capture-test-utils.js';

import type { SourceCommand } from '../../contract/source-workspace.js';

it('reopens canonical SQLite with exact ordered facts and one operation before and after Undo', () => {
  const root = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'capture-journey-legs-'));
  const filename = join(directory, 'trips.db');
  let opened: ReturnType<typeof openTripsDb> | undefined;
  try {
    opened = openTripsDb(filename);
    const tripId = createTrip(opened.db, {}).id;
    const operationId = randomUUID();
    const request: SourceCommand = {
      kind: 'capture.create',
      input: { originalText: 'Verbatim fictional booking email' },
      target: {
        mode: 'createJourney',
        input: { reference: 'Original Journey reference' },
        legs: [
          {
            service: 'FIRST',
            from: { date: '2028-01-06' },
            to: { local: '2028-01-07T02:10', timeZone: 'Europe/London' },
          },
          { service: 'SECOND', from: { sourceLabel: 'Unresolved source airport' } },
        ],
      },
    };
    const original = send(opened.db, tripId, request, operationId);
    expect(original.receipt.journeyLegSets?.[0]?.legs.map((leg) => leg.service)).toEqual([
      'FIRST',
      'SECOND',
    ]);
    opened.raw.close();
    opened = undefined;
    opened = openTripsDb(filename);
    const replayed = send(opened.db, tripId, request, operationId);
    expect(replayed).toEqual({ ...original, replayed: true });
    expect(listJourneys(opened.db, tripId)).toHaveLength(1);
    expect(opened.db.select().from(journeyLegs).all()).toHaveLength(2);
    expect(opened.db.select().from(sourceOperations).all()).toHaveLength(1);
    send(opened.db, tripId, { kind: 'undo', targetOperationId: operationId });
    opened.raw.close();
    opened = undefined;
    opened = openTripsDb(filename);
    const historical = send(opened.db, tripId, request, operationId);
    expect(historical.receipt).toEqual(original.receipt);
    expect(historical).toMatchObject({ replayed: true, undone: true });
    expect(historical.current.journeyLegSets).toEqual([]);
    expect(listJourneys(opened.db, tripId)).toEqual([]);
    expect(opened.db.select().from(journeyLegs).all()).toEqual([]);
    expect(opened.db.select().from(sourceOperations).all()).toHaveLength(2);
  } finally {
    opened?.raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

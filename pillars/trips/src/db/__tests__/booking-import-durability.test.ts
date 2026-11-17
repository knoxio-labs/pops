import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { openTripsDb } from '../index.js';
import {
  commitBookingSource,
  getBookingImport,
  reviewBookingSource,
} from '../services/booking-imports.js';
import { listJourneys } from '../services/journeys.js';
import { getJourneyLegSet } from '../services/leg-set.js';
import { readSourceWorkspace } from '../services/source-queries.js';
import { preparedBooking } from './booking-import-test-utils.js';
import { send } from './capture-test-utils.js';

import type { OpenedTripsDb } from '../index.js';

describe('Committed booking durability', () => {
  it('reopens original decisions, ordered leg proof and Undo tombstones without recreating targets', async () => {
    const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
    mkdirSync(scratch, { recursive: true });
    const directory = mkdtempSync(join(scratch, 'booking-commit-reopen-'));
    const path = join(directory, 'trips.db');
    let opened: OpenedTripsDb | undefined;
    try {
      opened = openTripsDb(path);
      const fixture = await preparedBooking(opened.db, [
        {
          mode: 'createJourney',
          input: { name: 'Durable reviewed flight' },
          legs: [
            {
              from: { sourceLabel: 'Source A', date: '2028-01-06' },
              to: { sourceLabel: 'Source B' },
            },
          ],
        },
      ]);
      const review = reviewBookingSource(
        opened.db,
        fixture.tripId,
        fixture.binding.sourceId,
        fixture.reviewInput
      );
      const input = {
        operationId: randomUUID(),
        decisionIds: review.decisions.map((decision) => decision.id),
      };
      const committed = commitBookingSource(
        opened.db,
        fixture.tripId,
        fixture.binding.sourceId,
        input
      );
      const child = committed.results[0];
      const proof = child?.receipt.journeyLegSets?.[0];
      if (child === undefined || proof === undefined)
        throw new Error('Expected committed flight proof');
      const before = getBookingImport(opened.db, fixture.tripId, fixture.binding.sourceId);
      const workspace = readSourceWorkspace(opened.db, fixture.tripId);
      opened.raw.close();
      opened = undefined;
      opened = openTripsDb(path);
      expect(getBookingImport(opened.db, fixture.tripId, fixture.binding.sourceId)).toEqual(before);
      expect(readSourceWorkspace(opened.db, fixture.tripId)).toEqual(workspace);
      expect(getJourneyLegSet(opened.db, fixture.tripId, proof.journeyId)).toEqual({
        revision: proof.revision,
        legs: proof.legs,
      });
      expect(
        commitBookingSource(opened.db, fixture.tripId, fixture.binding.sourceId, input).results[0]
          ?.receipt
      ).toEqual(child.receipt);
      expect(listJourneys(opened.db, fixture.tripId)).toHaveLength(1);
      send(opened.db, fixture.tripId, {
        kind: 'undo',
        targetOperationId: child.receipt.operationId,
      });
      const afterUndo = getBookingImport(opened.db, fixture.tripId, fixture.binding.sourceId);
      expect(afterUndo.decisions).toEqual(before.decisions);
      expect(afterUndo.accepted[0]?.result).toMatchObject({ receipt: child.receipt, undone: true });
      opened.raw.close();
      opened = undefined;
      opened = openTripsDb(path);
      expect(getBookingImport(opened.db, fixture.tripId, fixture.binding.sourceId)).toEqual(
        afterUndo
      );
      const resolved = commitBookingSource(opened.db, fixture.tripId, fixture.binding.sourceId, {
        ...input,
        operationId: randomUUID(),
      });
      expect(resolved).toMatchObject({
        kind: 'alreadyCommitted',
        originalOperationId: input.operationId,
      });
      expect(resolved.results[0]).toMatchObject({
        receipt: child.receipt,
        undone: true,
        current: { journeys: [], journeyLegSets: [] },
      });
      expect(listJourneys(opened.db, fixture.tripId)).toEqual([]);
      expect(readSourceWorkspace(opened.db, fixture.tripId).captures[0]?.originalText).toBe(
        fixture.capture.originalText
      );
    } finally {
      opened?.raw.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

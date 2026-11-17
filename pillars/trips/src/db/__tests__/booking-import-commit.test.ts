import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  commitBookingSource,
  getBookingImport,
  reviewBookingSource,
} from '../services/booking-imports.js';
import { listEvents } from '../services/events.js';
import { getCapture, readSourceWorkspace } from '../services/source-queries.js';
import { listStays } from '../services/stays.js';
import { preparedBooking, withBookingDb } from './booking-import-test-utils.js';
import { send } from './capture-test-utils.js';

describe('Explicit booking review and atomic commit', () => {
  it('creates several reviewed canonical targets only on commit and resolves fresh UUIDs to original proof', () =>
    withBookingDb(async (db) => {
      const fixture = await preparedBooking(db);
      const reviewed = reviewBookingSource(
        db,
        fixture.tripId,
        fixture.binding.sourceId,
        fixture.reviewInput
      );
      expect(reviewed.decisions).toHaveLength(2);
      expect(listStays(db, fixture.tripId)).toEqual([]);
      expect(listEvents(db, fixture.tripId)).toEqual([]);
      const input = {
        operationId: randomUUID(),
        decisionIds: reviewed.decisions.map((decision) => decision.id),
      };
      const committed = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, input);
      expect(committed.kind).toBe('committed');
      expect(committed.results).toHaveLength(2);
      expect(listStays(db, fixture.tripId)).toMatchObject([{ name: 'Harbour Hotel' }]);
      expect(listEvents(db, fixture.tripId)).toMatchObject([{ name: 'Evening performance' }]);
      const workspace = readSourceWorkspace(db, fixture.tripId);
      const nextOperationId = randomUUID();
      const resolved = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
        ...input,
        operationId: nextOperationId,
      });
      expect(resolved).toMatchObject({
        kind: 'alreadyCommitted',
        requestedOperationId: nextOperationId,
        originalOperationId: input.operationId,
      });
      expect(resolved.results.map((result) => result.receipt)).toEqual(
        committed.results.map((result) => result.receipt)
      );
      expect(resolved.results.every((result) => result.replayed && !result.undone)).toBe(true);
      expect(readSourceWorkspace(db, fixture.tripId)).toEqual(workspace);
      const replay = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, input);
      expect(replay.kind).toBe('committed');
      expect(replay.results.map((result) => result.receipt)).toEqual(
        committed.results.map((result) => result.receipt)
      );
      expect(replay.results.every((result) => result.replayed && !result.undone)).toBe(true);
    }));

  it('rejects competing initial decisions after one wins and admits an explicit additional occurrence', () =>
    withBookingDb(async (db) => {
      const fixture = await preparedBooking(db, [
        { mode: 'createStay', input: { name: 'First stay' } },
      ]);
      const first = reviewBookingSource(
        db,
        fixture.tripId,
        fixture.binding.sourceId,
        fixture.reviewInput
      );
      const competing = reviewBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
        ...fixture.reviewInput,
        operationId: randomUUID(),
      });
      commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
        operationId: randomUUID(),
        decisionIds: first.decisions.map((decision) => decision.id),
      });
      expect(() =>
        commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
          operationId: randomUUID(),
          decisionIds: competing.decisions.map((decision) => decision.id),
        })
      ).toThrow();
      expect(listStays(db, fixture.tripId)).toHaveLength(1);
      const snapshot = getBookingImport(db, fixture.tripId, fixture.binding.sourceId);
      const additional = reviewBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
        ...fixture.reviewInput,
        operationId: randomUUID(),
        admission: 'additional',
        expectedSourceRevision: snapshot.source.revision,
        expectedCaptureRevision: getCapture(db, fixture.tripId, fixture.capture.id).revision,
        decisions: [
          { proposalIds: [], target: { mode: 'createStay', input: { name: 'Second stay' } } },
        ],
      });
      commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
        operationId: randomUUID(),
        decisionIds: additional.decisions.map((decision) => decision.id),
      });
      expect(listStays(db, fixture.tripId)).toMatchObject([
        { name: 'First stay' },
        { name: 'Second stay' },
      ]);
    }));

  it('rolls back earlier child writes when a later canonical target fails validation', () =>
    withBookingDb(async (db) => {
      const fixture = await preparedBooking(db, [
        { mode: 'createStay', input: { name: 'Must roll back' } },
        { mode: 'createEvent', input: { name: 'Invalid visit', visitId: 999999 } },
      ]);
      const reviewed = reviewBookingSource(
        db,
        fixture.tripId,
        fixture.binding.sourceId,
        fixture.reviewInput
      );
      const before = readSourceWorkspace(db, fixture.tripId);
      const snapshot = getBookingImport(db, fixture.tripId, fixture.binding.sourceId);
      expect(() =>
        commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
          operationId: randomUUID(),
          decisionIds: reviewed.decisions.map((decision) => decision.id),
        })
      ).toThrow();
      expect(readSourceWorkspace(db, fixture.tripId)).toEqual(before);
      expect(getBookingImport(db, fixture.tripId, fixture.binding.sourceId)).toEqual(snapshot);
    }));

  it('preserves immutable import decisions and commit proof after operation-scoped Undo', () =>
    withBookingDb(async (db) => {
      const fixture = await preparedBooking(db, [
        { mode: 'createEvent', input: { name: 'Ticket' } },
      ]);
      const reviewed = reviewBookingSource(
        db,
        fixture.tripId,
        fixture.binding.sourceId,
        fixture.reviewInput
      );
      const input = {
        operationId: randomUUID(),
        decisionIds: reviewed.decisions.map((decision) => decision.id),
      };
      const committed = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, input);
      const child = committed.results[0];
      if (!child) throw new Error('Expected canonical child operation');
      const history = getBookingImport(db, fixture.tripId, fixture.binding.sourceId);
      send(db, fixture.tripId, { kind: 'undo', targetOperationId: child.receipt.operationId });
      const undone = getBookingImport(db, fixture.tripId, fixture.binding.sourceId);
      expect(undone.decisions).toEqual(history.decisions);
      expect(undone.attempts).toEqual(history.attempts);
      expect(undone.accepted).toHaveLength(1);
      expect(undone.accepted[0]?.result).toMatchObject({
        receipt: child.receipt,
        undone: true,
        replayed: true,
        current: { events: [] },
      });
      const replay = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, input);
      expect(replay.results).toHaveLength(1);
      expect(replay.results[0]).toMatchObject({
        receipt: child.receipt,
        undone: true,
        replayed: true,
        current: { events: [] },
      });
      const resolved = commitBookingSource(db, fixture.tripId, fixture.binding.sourceId, {
        ...input,
        operationId: randomUUID(),
      });
      expect(resolved).toMatchObject({
        kind: 'alreadyCommitted',
        originalOperationId: input.operationId,
        results: [
          { receipt: child.receipt, undone: true, replayed: true, current: { events: [] } },
        ],
      });
      expect(listEvents(db, fixture.tripId)).toEqual([]);
      expect(readSourceWorkspace(db, fixture.tripId).associations[0]?.removedAt).toEqual(
        expect.any(String)
      );
    }));
});

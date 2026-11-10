import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sourceOperations } from '../schema.js';
import { createPlace, createTrip, createVisit, listVisits } from '../services/records.js';
import { getCapture, readSourceWorkspace } from '../services/source-queries.js';
import { send, withCaptureDb } from './capture-test-utils.js';

describe('Capture source persistence and replay', () => {
  it('retains immutable Unicode/whitespace, opaque URLs and real accepted task/original provenance', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const input = {
        originalText: '  Recife\n\tOlá 🌆  ',
        originalUrl: '  opaque source URL  ',
        attachments: [{ kind: 'task' as const, taskId: 'accepted-task' }],
      };
      const created = send(db, trip.id, { kind: 'capture.create', input });
      const capture = created.receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      expect(capture).toMatchObject({
        ...input,
        classification: null,
        title: null,
        placeId: null,
        visitId: null,
        revision: 1,
      });
      const attached = send(db, trip.id, {
        kind: 'capture.attach',
        id: capture.id,
        expectedRevision: 1,
        attachment: { kind: 'document', documentId: 42, taskId: 'accepted-task' },
      });
      expect(attached.receipt.captures[0]?.attachments).toEqual([
        ...input.attachments,
        { kind: 'document', documentId: 42, taskId: 'accepted-task' },
      ]);
      send(db, trip.id, {
        kind: 'capture.update',
        id: capture.id,
        expectedRevision: 2,
        input: { classification: 'event', title: 'Edited name', notes: 'User note' },
      });
      expect(getCapture(db, trip.id, capture.id)).toMatchObject({
        originalText: input.originalText,
        originalUrl: input.originalUrl,
        classification: 'event',
        revision: 3,
      });
      expect(readSourceWorkspace(db, trip.id).associations).toEqual([]);
      expect(readSourceWorkspace(db, trip.id).events).toEqual([]);
      expect(listVisits(db, trip.id)).toEqual([]);
      expect(
        send(db, trip.id, {
          kind: 'capture.create',
          input: { originalText: '', attachments: [{ kind: 'document', documentId: 43 }] },
        }).receipt.captures[0]?.originalText
      ).toBe('');
    }));

  it('replays lost responses and retries after Undo without writes, distinguishing original receipt from now', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const operationId = randomUUID();
      const command = {
        kind: 'capture.create' as const,
        input: { originalText: 'Original', notes: 'Original note' },
      };
      const created = send(db, trip.id, command, operationId);
      const replay = send(
        db,
        trip.id,
        { kind: 'capture.create', input: { notes: 'Original note', originalText: 'Original' } },
        operationId
      );
      expect(replay).toEqual({ ...created, replayed: true });
      expect(db.select().from(sourceOperations).all()).toHaveLength(1);
      const undoId = randomUUID();
      const undo = { kind: 'undo' as const, targetOperationId: operationId };
      const undone = send(db, trip.id, undo, undoId);
      expect(undone.receipt.captures[0]?.removedAt).toEqual(expect.any(String));
      const afterUndo = send(db, trip.id, command, operationId);
      expect(afterUndo.receipt).toEqual(created.receipt);
      expect(afterUndo).toMatchObject({
        undone: true,
        replayed: true,
        current: { captures: [{ revision: 2, removedAt: expect.any(String) }] },
      });
      expect(send(db, trip.id, undo, undoId)).toEqual({ ...undone, replayed: true });
      expect(db.select().from(sourceOperations).all()).toHaveLength(2);
      expect(() =>
        send(db, trip.id, { ...command, input: { originalText: 'Changed payload' } }, operationId)
      ).toThrow('source_operation_mismatch');
      expect(db.select().from(sourceOperations).all()).toHaveLength(2);
    }));

  it('rolls back cross-trip and missing references and never resolves same-label places by name', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const other = createTrip(db, {});
      const first = createPlace(db, { name: 'São Paulo' });
      const second = createPlace(db, { name: 'São Paulo' });
      const foreign = createVisit(db, other.id, { placeId: first.id });
      const command = {
        kind: 'capture.create' as const,
        input: { originalText: 'Retained', placeId: second.id },
      };
      const result = send(db, trip.id, command);
      const capture = result.receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      expect(capture.placeId).toBe(second.id);
      for (const visitId of [foreign.id, 99999]) {
        expect(() =>
          send(db, trip.id, {
            kind: 'capture.update',
            id: capture.id,
            expectedRevision: 1,
            input: { notes: 'Rejected', visitId },
          })
        ).toThrow('not_found');
        expect(() =>
          send(db, trip.id, {
            kind: 'capture.create',
            input: { originalText: 'Rejected', visitId },
            explore: true,
          })
        ).toThrow('not_found');
      }
      expect(getCapture(db, trip.id, capture.id)).toEqual(capture);
      expect(() =>
        send(db, other.id, {
          kind: 'capture.update',
          id: capture.id,
          expectedRevision: 1,
          input: { notes: 'Foreign' },
        })
      ).toThrow('not_found');
      expect(() => send(db, 99999, command)).toThrow('not_found');
      expect(db.select().from(sourceOperations).all()).toHaveLength(1);
      expect(readSourceWorkspace(db, trip.id).captures).toEqual([capture]);
    }));
});

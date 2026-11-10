import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sourceOperations } from '../schema.js';
import { createPlace, createTrip, createVisit } from '../services/records.js';
import { getCapture, readSourceWorkspace } from '../services/source-queries.js';
import { send, withCaptureDb } from './capture-test-utils.js';

describe('Capture ownership and inverse boundaries', () => {
  it('retains accepted Documents task and original identities when a file-only capture is undone', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const attachments = [
        { kind: 'task' as const, taskId: 'accepted-upload' },
        { kind: 'document' as const, documentId: 42, taskId: 'resolved-upload' },
      ];
      const creation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: '', attachments },
      });
      const capture = creation.receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      send(db, trip.id, { kind: 'undo', targetOperationId: creation.receipt.operationId });
      expect(getCapture(db, trip.id, capture.id)).toMatchObject({
        originalText: '',
        attachments,
        removedAt: expect.any(String),
      });
      expect(creation.receipt.captures[0]?.attachments).toEqual(attachments);
    }));
  it('keeps the same operation UUID isolated by trip ownership', () =>
    withCaptureDb((db) => {
      const first = createTrip(db, {});
      const second = createTrip(db, {});
      const operationId = randomUUID();
      const command = {
        kind: 'capture.create' as const,
        input: { originalText: 'Same exact input' },
      };
      const firstReceipt = send(db, first.id, command, operationId);
      const secondReceipt = send(db, second.id, command, operationId);
      expect(firstReceipt.receipt.captures[0]?.id).not.toBe(secondReceipt.receipt.captures[0]?.id);
      expect(secondReceipt.replayed).toBe(false);
      send(db, first.id, { kind: 'undo', targetOperationId: operationId });
      expect(readSourceWorkspace(db, second.id).captures).toEqual(secondReceipt.receipt.captures);
      expect(db.select().from(sourceOperations).all()).toHaveLength(3);
    }));
  it('rolls back create-and-associate for foreign visit references without leaving a target or receipt', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const other = createTrip(db, {});
      const place = createPlace(db, { name: 'Same label' });
      const foreign = createVisit(db, other.id, { placeId: place.id });
      const capture = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source retained' },
      }).receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      for (const target of [
        { mode: 'createIdea' as const, input: { visitId: foreign.id } },
        { mode: 'createEvent' as const, input: { visitId: foreign.id } },
      ]) {
        expect(() =>
          send(db, trip.id, {
            kind: 'capture.organise',
            id: capture.id,
            expectedRevision: 1,
            target,
            explore: true,
          })
        ).toThrow('not_found');
      }
      expect(readSourceWorkspace(db, trip.id)).toEqual({
        captures: [capture],
        ideas: [],
        events: [],
        journeys: [],
        stays: [],
        associations: [],
        memberships: [],
      });
      expect(db.select().from(sourceOperations).all()).toHaveLength(1);
    }));
  it('rejects membership-restoration Undo when its source was removed after collection removal', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const creation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source' },
        explore: true,
      });
      const member = creation.receipt.memberships[0];
      const capture = creation.receipt.captures[0];
      if (!member || !capture) throw new Error('Expected capture and membership');
      const removal = send(db, trip.id, {
        kind: 'explore.remove',
        id: member.id,
        expectedRevision: 1,
      });
      send(db, trip.id, { kind: 'capture.remove', id: capture.id, expectedRevision: 1 });
      const before = readSourceWorkspace(db, trip.id);
      expect(() =>
        send(db, trip.id, { kind: 'undo', targetOperationId: removal.receipt.operationId })
      ).toThrow('source_undo_conflict');
      expect(readSourceWorkspace(db, trip.id)).toEqual(before);
    }));
});

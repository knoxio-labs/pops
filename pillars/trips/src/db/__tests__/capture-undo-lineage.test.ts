import { describe, expect, it } from 'vitest';

import { sourceOperations } from '../schema.js';
import { createEvent, updateEvent } from '../services/events.js';
import { createTrip } from '../services/records.js';
import { getCapture, getIdea, readSourceWorkspace } from '../services/source-queries.js';
import { send, withCaptureDb } from './capture-test-utils.js';

describe('Confirmed inverse lineage and repeated LIFO Undo', () => {
  it('undoes successive capture edits and original creation without rewriting immutable receipts', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const creation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Original source' },
      });
      const capture = creation.receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      const first = send(db, trip.id, {
        kind: 'capture.update',
        id: capture.id,
        expectedRevision: 1,
        input: { notes: 'First edit' },
      });
      const second = send(db, trip.id, {
        kind: 'capture.update',
        id: capture.id,
        expectedRevision: 2,
        input: { notes: 'Second edit' },
      });
      const undoSecond = send(db, trip.id, {
        kind: 'undo',
        targetOperationId: second.receipt.operationId,
      });
      expect(undoSecond.receipt.captures[0]).toMatchObject({ revision: 4, notes: 'First edit' });
      const ledger = db.select().from(sourceOperations).all();
      const snapshot = readSourceWorkspace(db, trip.id);
      expect(
        send(
          db,
          trip.id,
          { kind: 'undo', targetOperationId: second.receipt.operationId },
          undoSecond.receipt.operationId
        ).replayed
      ).toBe(true);
      expect(db.select().from(sourceOperations).all()).toEqual(ledger);
      expect(readSourceWorkspace(db, trip.id)).toEqual(snapshot);
      expect(
        send(
          db,
          trip.id,
          {
            kind: 'capture.update',
            id: capture.id,
            expectedRevision: 1,
            input: { notes: 'First edit' },
          },
          first.receipt.operationId
        ).receipt
      ).toEqual(first.receipt);
      send(db, trip.id, { kind: 'undo', targetOperationId: first.receipt.operationId });
      expect(getCapture(db, trip.id, capture.id)).toMatchObject({ revision: 5, notes: '' });
      send(db, trip.id, { kind: 'undo', targetOperationId: creation.receipt.operationId });
      expect(getCapture(db, trip.id, capture.id)).toMatchObject({
        revision: 6,
        originalText: 'Original source',
        removedAt: expect.any(String),
      });
    }));

  it('never borrows an external writer revision, even when that writer restores identical field values', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const creation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source' },
      });
      const capture = creation.receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      const edited = send(db, trip.id, {
        kind: 'capture.update',
        id: capture.id,
        expectedRevision: 1,
        input: { notes: 'Own edit' },
      });
      send(db, trip.id, { kind: 'undo', targetOperationId: edited.receipt.operationId });
      send(db, trip.id, {
        kind: 'capture.update',
        id: capture.id,
        expectedRevision: 3,
        input: { notes: '' },
      });
      const snapshot = readSourceWorkspace(db, trip.id);
      const ledger = db.select().from(sourceOperations).all();
      expect(() =>
        send(db, trip.id, { kind: 'undo', targetOperationId: creation.receipt.operationId })
      ).toThrow('source_undo_conflict');
      expect(readSourceWorkspace(db, trip.id)).toEqual(snapshot);
      expect(db.select().from(sourceOperations).all()).toEqual(ledger);
    }));

  it('supports association-removal, organisation and original capture Undo in succession', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const event = createEvent(db, trip.id, { name: 'Existing target' });
      const creation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source' },
      });
      const capture = creation.receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      const organisation = send(db, trip.id, {
        kind: 'capture.organise',
        id: capture.id,
        expectedRevision: 1,
        target: { mode: 'existing', target: { kind: 'event', id: event.id } },
      });
      const association = organisation.receipt.associations[0];
      if (!association) throw new Error('Expected association');
      const removal = send(db, trip.id, {
        kind: 'association.remove',
        id: association.id,
        expectedRevision: 1,
      });
      send(db, trip.id, { kind: 'undo', targetOperationId: removal.receipt.operationId });
      send(db, trip.id, { kind: 'undo', targetOperationId: organisation.receipt.operationId });
      send(db, trip.id, { kind: 'undo', targetOperationId: creation.receipt.operationId });
      const workspace = readSourceWorkspace(db, trip.id);
      expect(workspace.captures[0]?.removedAt).toEqual(expect.any(String));
      expect(workspace.associations[0]).toMatchObject({
        revision: 4,
        removedAt: expect.any(String),
      });
      expect(workspace.events).toEqual([event]);
    }));

  it('supports membership-removal and Idea edit lineage without lending revisions across record kinds', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const creation = send(db, trip.id, {
        kind: 'idea.create',
        input: { name: 'Idea' },
        explore: true,
      });
      const idea = creation.receipt.ideas[0];
      const member = creation.receipt.memberships[0];
      if (!idea || !member) throw new Error('Expected Idea and membership');
      const removal = send(db, trip.id, {
        kind: 'explore.remove',
        id: member.id,
        expectedRevision: 1,
      });
      send(db, trip.id, { kind: 'undo', targetOperationId: removal.receipt.operationId });
      const edit = send(db, trip.id, {
        kind: 'idea.update',
        id: idea.id,
        expectedRevision: 1,
        input: { notes: 'Edit' },
      });
      send(db, trip.id, { kind: 'undo', targetOperationId: edit.receipt.operationId });
      send(db, trip.id, { kind: 'undo', targetOperationId: creation.receipt.operationId });
      expect(getIdea(db, trip.id, idea.id)).toMatchObject({
        revision: 4,
        removedAt: expect.any(String),
      });
      expect(readSourceWorkspace(db, trip.id).memberships[0]).toMatchObject({
        revision: 4,
        removedAt: expect.any(String),
      });
    }));

  it('rolls back provisional predecessor acknowledgement if a later target dependency rejects Undo', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const creation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source' },
      });
      const capture = creation.receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      const organisation = send(db, trip.id, {
        kind: 'capture.organise',
        id: capture.id,
        expectedRevision: 1,
        target: { mode: 'createEvent', input: {} },
      });
      const event = organisation.receipt.events[0];
      if (!event) throw new Error('Expected Event');
      updateEvent(db, trip.id, event.id, { notes: 'Independent change' });
      const ledger = db.select().from(sourceOperations).all();
      const snapshot = readSourceWorkspace(db, trip.id);
      expect(() =>
        send(db, trip.id, { kind: 'undo', targetOperationId: organisation.receipt.operationId })
      ).toThrow('source_undo_conflict');
      expect(db.select().from(sourceOperations).all()).toEqual(ledger);
      expect(readSourceWorkspace(db, trip.id)).toEqual(snapshot);
    }));
});

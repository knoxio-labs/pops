import { describe, expect, it } from 'vitest';

import {
  createDocumentAssociation,
  listDocumentAssociations,
} from '../services/document-associations.js';
import { createEvent, getEvent, updateEvent } from '../services/events.js';
import { createTrip, listVisits } from '../services/records.js';
import { getCapture, getIdea, readSourceWorkspace } from '../services/source-queries.js';
import { send, withCaptureDb } from './capture-test-utils.js';

describe('Operation-scoped capture Undo', () => {
  it('retains both identities and provenance on conversion and Undo preserves unrelated source edits', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const capture = send(db, trip.id, {
        kind: 'capture.create',
        input: {
          originalText: '  Verbatim ticket\n',
          attachments: [{ kind: 'document', documentId: 42, taskId: 'accepted-task' }],
        },
      }).receipt.captures[0];
      const unrelated = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Other source' },
      }).receipt.captures[0];
      if (!capture || !unrelated) throw new Error('Expected captures');
      const target = createEvent(db, trip.id, { name: 'Birthday' });
      const organised = send(db, trip.id, {
        kind: 'capture.organise',
        id: capture.id,
        expectedRevision: capture.revision,
        target: { mode: 'existing', target: { kind: 'event', id: target.id } },
        explore: true,
      });
      expect(organised.receipt.associations[0]).toMatchObject({
        captureId: capture.id,
        target: { kind: 'event', id: target.id },
        provenance: 'existing',
        sourceRevision: capture.revision,
      });
      const edited = updateEvent(db, trip.id, target.id, { notes: 'An independent target edit' });
      const otherEdit = send(db, trip.id, {
        kind: 'capture.update',
        id: unrelated.id,
        expectedRevision: unrelated.revision,
        input: { notes: 'Retain new work' },
      }).receipt.captures[0];
      const undone = send(db, trip.id, {
        kind: 'undo',
        targetOperationId: organised.receipt.operationId,
      });
      expect(undone.receipt.associations[0]?.removedAt).toEqual(expect.any(String));
      expect(undone.receipt.memberships[0]?.removedAt).toEqual(expect.any(String));
      expect(getCapture(db, trip.id, capture.id)).toMatchObject({
        id: capture.id,
        originalText: capture.originalText,
        attachments: capture.attachments,
        removedAt: null,
        revision: 3,
      });
      expect(getCapture(db, trip.id, unrelated.id)).toEqual(otherEdit);
      expect(getEvent(db, trip.id, target.id)).toEqual(edited);
      expect(listVisits(db, trip.id)).toEqual([]);
    }));

  it('undoes an unchanged created Idea atomically and keeps tombstones and accepted owner identities', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const capture = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: '', attachments: [{ kind: 'task', taskId: 'accepted-task' }] },
      }).receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      const conversion = send(db, trip.id, {
        kind: 'capture.organise',
        id: capture.id,
        expectedRevision: 1,
        target: { mode: 'createIdea', input: { name: 'Source idea', kind: 'activity' } },
        explore: true,
      });
      const idea = conversion.receipt.ideas[0];
      if (!idea) throw new Error('Expected idea');
      expect(conversion.receipt.associations[0]).toMatchObject({
        captureId: capture.id,
        target: { kind: 'idea', id: idea.id },
        provenance: 'created',
      });
      send(db, trip.id, { kind: 'undo', targetOperationId: conversion.receipt.operationId });
      expect(getIdea(db, trip.id, idea.id)).toMatchObject({
        id: idea.id,
        removedAt: expect.any(String),
        revision: 2,
      });
      expect(getCapture(db, trip.id, capture.id).attachments).toEqual(capture.attachments);
      expect(readSourceWorkspace(db, trip.id).associations).toMatchObject([
        { removedAt: expect.any(String) },
      ]);
      expect(() =>
        send(db, trip.id, { kind: 'undo', targetOperationId: conversion.receipt.operationId })
      ).toThrow('source_undo_conflict');
    }));

  it('rolls back all provisional inverse writes if a created Event was edited, referenced, or removed', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      for (const change of ['edit', 'document', 'membership'] as const) {
        const capture = send(db, trip.id, {
          kind: 'capture.create',
          input: { originalText: `Source ${change}` },
        }).receipt.captures[0];
        if (!capture) throw new Error('Expected capture');
        const conversion = send(db, trip.id, {
          kind: 'capture.organise',
          id: capture.id,
          expectedRevision: 1,
          target: {
            mode: 'createEvent',
            input: { name: 'Created Event', timing: { start: '2028-01-03' } },
          },
        });
        const event = conversion.receipt.events[0];
        if (!event) throw new Error('Expected event');
        if (change === 'edit')
          updateEvent(db, trip.id, event.id, { notes: 'Keep this independent edit' });
        if (change === 'document')
          createDocumentAssociation(db, trip.id, {
            documentId: 42,
            targetKind: 'event',
            targetId: event.id,
          });
        if (change === 'membership')
          send(db, trip.id, { kind: 'explore.add', source: { kind: 'event', id: event.id } });
        const before = readSourceWorkspace(db, trip.id);
        const documents = listDocumentAssociations(db, trip.id);
        expect(() =>
          send(db, trip.id, { kind: 'undo', targetOperationId: conversion.receipt.operationId })
        ).toThrow('source_undo_conflict');
        expect(readSourceWorkspace(db, trip.id)).toEqual(before);
        expect(listDocumentAssociations(db, trip.id)).toEqual(documents);
      }
    }));

  it('rejects stale capture Undo and created Idea dependencies without overwriting newer work', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const creation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source' },
      });
      const capture = creation.receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      const conversion = send(db, trip.id, {
        kind: 'capture.organise',
        id: capture.id,
        expectedRevision: 1,
        target: { mode: 'createIdea', input: {} },
      });
      const idea = conversion.receipt.ideas[0];
      if (!idea) throw new Error('Expected idea');
      send(db, trip.id, { kind: 'explore.add', source: { kind: 'idea', id: idea.id } });
      const before = readSourceWorkspace(db, trip.id);
      expect(() =>
        send(db, trip.id, { kind: 'undo', targetOperationId: creation.receipt.operationId })
      ).toThrow('source_undo_conflict');
      expect(() =>
        send(db, trip.id, { kind: 'undo', targetOperationId: conversion.receipt.operationId })
      ).toThrow('source_undo_conflict');
      expect(readSourceWorkspace(db, trip.id)).toEqual(before);
    }));
});

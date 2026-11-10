import { describe, expect, it } from 'vitest';

import { createEvent, getEvent } from '../services/events.js';
import { createTrip } from '../services/records.js';
import { getCapture, readSourceWorkspace } from '../services/source-queries.js';
import { send, withCaptureDb } from './capture-test-utils.js';

describe('Relation inverse dependencies', () => {
  it('does not resurrect removed membership over a newer membership of the same source', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const creation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source' },
        explore: true,
      });
      const member = creation.receipt.memberships[0];
      if (!member) throw new Error('Expected membership');
      const removal = send(db, trip.id, {
        kind: 'explore.remove',
        id: member.id,
        expectedRevision: member.revision,
      });
      send(db, trip.id, { kind: 'explore.add', source: member.source });
      const before = readSourceWorkspace(db, trip.id);
      expect(() =>
        send(db, trip.id, { kind: 'undo', targetOperationId: removal.receipt.operationId })
      ).toThrow('source_undo_conflict');
      expect(readSourceWorkspace(db, trip.id)).toEqual(before);
    }));

  it('does not restore an old association over a later organisation or a removed source', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const capture = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source' },
      }).receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      const event = createEvent(db, trip.id, {});
      const target = {
        mode: 'existing' as const,
        target: { kind: 'event' as const, id: event.id },
      };
      const organised = send(db, trip.id, {
        kind: 'capture.organise',
        id: capture.id,
        expectedRevision: 1,
        target,
      });
      const association = organised.receipt.associations[0];
      if (!association) throw new Error('Expected association');
      const removed = send(db, trip.id, {
        kind: 'association.remove',
        id: association.id,
        expectedRevision: 1,
      });
      send(db, trip.id, { kind: 'capture.organise', id: capture.id, expectedRevision: 2, target });
      const before = readSourceWorkspace(db, trip.id);
      expect(() =>
        send(db, trip.id, { kind: 'undo', targetOperationId: removed.receipt.operationId })
      ).toThrow('source_undo_conflict');
      expect(readSourceWorkspace(db, trip.id)).toEqual(before);
      expect(getCapture(db, trip.id, capture.id).revision).toBe(3);
    }));

  it('removes an unchanged created Event on Undo without reexecuting creation during receipt replay', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const capture = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source' },
      }).receipt.captures[0];
      if (!capture) throw new Error('Expected capture');
      const command = {
        kind: 'capture.organise' as const,
        id: capture.id,
        expectedRevision: 1,
        target: {
          mode: 'createEvent' as const,
          input: { name: 'Original Event', intention: 'Considering' as const },
        },
        explore: true,
      };
      const conversion = send(db, trip.id, command);
      const event = conversion.receipt.events[0];
      if (!event) throw new Error('Expected event');
      send(db, trip.id, { kind: 'undo', targetOperationId: conversion.receipt.operationId });
      expect(() => getEvent(db, trip.id, event.id)).toThrow('not_found');
      const replay = send(db, trip.id, command, conversion.receipt.operationId);
      expect(replay.receipt).toEqual(conversion.receipt);
      expect(replay).toMatchObject({ replayed: true, undone: true, current: { events: [] } });
      expect(readSourceWorkspace(db, trip.id).events).toEqual([]);
    }));
});

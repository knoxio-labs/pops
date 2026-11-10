import { describe, expect, it } from 'vitest';

import { sourceOperations } from '../schema.js';
import { createPlace, createTrip, createVisit, listVisits } from '../services/records.js';
import { getCapture, getIdea, readSourceWorkspace } from '../services/source-queries.js';
import { send, withCaptureDb } from './capture-test-utils.js';

describe('Atomic explicitly organised capture creation', () => {
  it('retains raw capture and activity subtype as distinct identities in one operation and Undo', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const command = {
        kind: 'capture.create' as const,
        input: { originalText: '  User source\n🌆 ', originalUrl: 'opaque source' },
        target: {
          mode: 'createIdea' as const,
          input: {
            name: 'User activity title',
            kind: 'activity' as const,
            purpose: 'meet-people' as const,
            status: 'Saved' as const,
            timing: { mode: 'month' as const, month: '2028-01' },
          },
        },
        explore: true,
      };
      const created = send(db, trip.id, command);
      expect(created.receipt.captures).toHaveLength(1);
      const capture = created.receipt.captures[0];
      const idea = created.receipt.ideas[0];
      if (!capture || !idea) throw new Error('Expected distinct capture and Idea sources');
      expect(capture).toMatchObject({
        originalText: command.input.originalText,
        originalUrl: 'opaque source',
        classification: null,
        revision: 2,
      });
      expect(idea).toMatchObject({
        name: 'User activity title',
        kind: 'activity',
        purpose: 'meet-people',
        status: 'Saved',
        timing: { mode: 'month', month: '2028-01' },
      });
      expect(created.receipt.associations[0]).toMatchObject({
        captureId: capture.id,
        target: { kind: 'idea', id: idea.id },
        provenance: 'created',
      });
      expect(created.receipt.memberships[0]?.source).toEqual({ kind: 'idea', id: idea.id });
      expect(db.select().from(sourceOperations).all()).toHaveLength(1);
      expect(listVisits(db, trip.id)).toEqual([]);
      send(db, trip.id, { kind: 'undo', targetOperationId: created.receipt.operationId });
      expect(getCapture(db, trip.id, capture.id)).toMatchObject({
        originalText: command.input.originalText,
        removedAt: expect.any(String),
        revision: 3,
      });
      expect(getIdea(db, trip.id, idea.id).removedAt).toEqual(expect.any(String));
      const replay = send(db, trip.id, command, created.receipt.operationId);
      expect(replay.receipt).toEqual(created.receipt);
      expect(replay.undone).toBe(true);
      expect(readSourceWorkspace(db, trip.id).captures).toHaveLength(1);
    }));
  it('rolls back the newly captured source as well as target, membership and receipt if target ownership fails', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const other = createTrip(db, {});
      const place = createPlace(db, { name: 'Location' });
      const visit = createVisit(db, other.id, { placeId: place.id });
      for (const target of [
        { mode: 'createIdea' as const, input: { visitId: visit.id } },
        { mode: 'createEvent' as const, input: { visitId: visit.id } },
      ]) {
        expect(() =>
          send(db, trip.id, {
            kind: 'capture.create',
            input: { originalText: 'Rejected atomic capture' },
            target,
            explore: true,
          })
        ).toThrow('not_found');
        expect(readSourceWorkspace(db, trip.id)).toEqual({
          captures: [],
          ideas: [],
          events: [],
          journeys: [],
          stays: [],
          associations: [],
          memberships: [],
        });
        expect(db.select().from(sourceOperations).all()).toEqual([]);
      }
    }));
});

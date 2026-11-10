import { describe, expect, it } from 'vitest';

import { createEvent, deleteEvent } from '../services/events.js';
import { createPlace, createTrip, createVisit, listVisits } from '../services/records.js';
import { IDEA_COMMANDS, operateSourceWorkspace } from '../services/source-operations.js';
import { getIdea, readSourceWorkspace } from '../services/source-queries.js';
import { send, withCaptureDb } from './capture-test-utils.js';

describe('Independent Ideas and explicit Explore membership', () => {
  it('keeps timing, reasons, owner references and explicit place/visit identities independent of route membership', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const place = createPlace(db, { name: 'Recife' });
      const visit = createVisit(db, trip.id, {
        placeId: place.id,
        timing: { arrival: '2028-01-01' },
      });
      const route = listVisits(db, trip.id);
      const created = send(db, trip.id, {
        kind: 'idea.create',
        input: {
          name: '  Meet someone  ',
          kind: 'activity',
          purpose: 'meet-people',
          status: 'In plan',
          placeId: place.id,
          visitId: visit.id,
          timing: { mode: 'dates', from: '2028-02-12', to: '2028-02-02' },
          reason: 'User reason',
          sourceLinks: [{ uri: 'https://example.test/source' }],
          contactLinks: [{ uri: 'pops:contacts/contact/unavailable-contact' }],
          recommendations: [
            {
              contact: { uri: 'pops:contacts/contact/missing-recommender' },
              note: 'Verbatim recommendation',
            },
          ],
        },
        explore: true,
      });
      const idea = created.receipt.ideas[0];
      if (!idea) throw new Error('Expected idea');
      expect(getIdea(db, trip.id, idea.id)).toEqual(idea);
      const edited = send(db, trip.id, {
        kind: 'idea.update',
        id: idea.id,
        expectedRevision: 1,
        input: { notes: 'Unrelated edit', placeId: null, timing: { mode: 'none' } },
      }).receipt.ideas[0];
      expect(edited).toMatchObject({
        placeId: null,
        visitId: visit.id,
        contactLinks: idea.contactLinks,
        recommendations: idea.recommendations,
        timing: { mode: 'none' },
        reason: idea.reason,
        name: '  Meet someone  ',
      });
      expect(listVisits(db, trip.id)).toEqual(route);
    }));

  it('removes collection membership without deleting captures, Ideas or Events and guards dependent Undo', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const other = createTrip(db, {});
      const foreignEvent = createEvent(db, other.id, {});
      expect(() =>
        send(db, trip.id, { kind: 'explore.add', source: { kind: 'event', id: foreignEvent.id } })
      ).toThrow('not_found');
      const capture = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'A capture' },
        explore: true,
      });
      const idea = send(db, trip.id, { kind: 'idea.create', input: {}, explore: true });
      const event = createEvent(db, trip.id, { name: 'Birthday' });
      send(db, trip.id, { kind: 'explore.add', source: { kind: 'event', id: event.id } });
      expect(() => deleteEvent(db, trip.id, event.id)).toThrow('source_referenced');
      const before = readSourceWorkspace(db, trip.id);
      for (const membership of before.memberships)
        send(db, trip.id, {
          kind: 'explore.remove',
          id: membership.id,
          expectedRevision: membership.revision,
        });
      const after = readSourceWorkspace(db, trip.id);
      expect(after.captures).toEqual(capture.receipt.captures);
      expect(after.ideas).toEqual(idea.receipt.ideas);
      expect(after.events).toEqual([event]);
      expect(after.memberships.every((membership) => membership.removedAt !== null)).toBe(true);
      const addedAgain = send(db, trip.id, {
        kind: 'explore.add',
        source: { kind: 'event', id: event.id },
      });
      const member = addedAgain.receipt.memberships[0];
      if (!member) throw new Error('Expected membership');
      expect(() => send(db, trip.id, { kind: 'explore.add', source: member.source })).toThrow(
        'source_revision_conflict'
      );
    }));

  it('prevents Idea Undo scopes from reversing capture operations and keeps failed receipts absent', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const capture = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Source' },
      });
      const request = {
        operationId: 'd33f1690-d731-4f88-a1fc-4356a360f27b',
        command: { kind: 'undo' as const, targetOperationId: capture.receipt.operationId },
      };
      const before = readSourceWorkspace(db, trip.id);
      expect(() => operateSourceWorkspace(db, trip.id, request, IDEA_COMMANDS)).toThrow(
        'source_undo_conflict'
      );
      expect(readSourceWorkspace(db, trip.id)).toEqual(before);
      expect(
        send(db, trip.id, request.command, request.operationId).receipt.captures[0]?.removedAt
      ).toEqual(expect.any(String));
      expect(() => operateSourceWorkspace(db, trip.id, request, IDEA_COMMANDS)).toThrow(
        'source_undo_conflict'
      );
    }));
});

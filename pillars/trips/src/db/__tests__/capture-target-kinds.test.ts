import { describe, expect, it } from 'vitest';

import { createDecision, createDecisionOption } from '../services/decisions.js';
import { createJourneyGroup } from '../services/journey-groups.js';
import { createJourneyLeg } from '../services/journey-legs.js';
import { createJourney, deleteJourney, getJourney } from '../services/journeys.js';
import { createTrip, listVisits } from '../services/records.js';
import { readSourceWorkspace } from '../services/source-queries.js';
import { createStay, deleteStay, getStay, updateStay } from '../services/stays.js';
import { send, withCaptureDb } from './capture-test-utils.js';

describe('Explicit Journey, Stay and Contacts capture targets', () => {
  it('links existing local targets only through their owning trip and protects their active references', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const other = createTrip(db, {});
      const journey = createJourney(db, trip.id, { name: 'Independent transport source' });
      const stay = createStay(db, trip.id, { status: 'Reserved' });
      const foreign = createJourney(db, other.id, {});
      expect(() =>
        send(db, trip.id, {
          kind: 'capture.create',
          input: { originalText: 'Foreign target' },
          target: { mode: 'existing', target: { kind: 'journey', id: foreign.id } },
        })
      ).toThrow('not_found');
      for (const target of [
        { kind: 'journey' as const, id: journey.id },
        { kind: 'stay' as const, id: stay.id },
      ]) {
        const linked = send(db, trip.id, {
          kind: 'capture.create',
          input: { originalText: 'Verbatim source' },
          target: { mode: 'existing', target },
        });
        expect(linked.receipt.associations[0]).toMatchObject({ target, provenance: 'existing' });
        expect(() =>
          target.kind === 'journey'
            ? deleteJourney(db, trip.id, target.id)
            : deleteStay(db, trip.id, target.id)
        ).toThrow('source_referenced');
        send(db, trip.id, { kind: 'undo', targetOperationId: linked.receipt.operationId });
      }
      expect(getJourney(db, trip.id, journey.id)).toEqual(journey);
      expect(getStay(db, trip.id, stay.id)).toEqual(stay);
      expect(listVisits(db, trip.id)).toEqual([]);
    }));

  it('creates explicitly described Journey/Stay sources atomically and removes only unchanged creations on Undo', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const journeyCreation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Transport source' },
        target: {
          mode: 'createJourney',
          input: {
            name: 'User journey title',
            reference: 'User reference',
            buffers: { minimumConnectionMinutes: 12 },
          },
        },
      });
      const journey = journeyCreation.receipt.journeys[0];
      const stayCreation = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Lodging source' },
        target: {
          mode: 'createStay',
          input: { name: 'User stay title', status: 'Reserved', timing: { arrival: '2028-01-02' } },
        },
      });
      const stay = stayCreation.receipt.stays[0];
      if (!journey || !stay) throw new Error('Expected Journey and Stay sources');
      expect(journey).toMatchObject({
        name: 'User journey title',
        reference: 'User reference',
        buffers: { minimumConnectionMinutes: 12 },
      });
      expect(stay).toMatchObject({ status: 'Reserved', timing: { arrival: '2028-01-02' } });
      expect(listVisits(db, trip.id)).toEqual([]);
      send(db, trip.id, { kind: 'undo', targetOperationId: journeyCreation.receipt.operationId });
      send(db, trip.id, { kind: 'undo', targetOperationId: stayCreation.receipt.operationId });
      expect(() => getJourney(db, trip.id, journey.id)).toThrow('not_found');
      expect(() => getStay(db, trip.id, stay.id)).toThrow('not_found');
      expect(
        readSourceWorkspace(db, trip.id).captures.every((capture) => capture.removedAt !== null)
      ).toBe(true);
    }));

  it('rolls back Undo when Journey legs/groups, active Decisions or later Stay edits depend on a creation', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      for (const dependency of ['leg', 'group', 'decision', 'stayEdit'] as const) {
        const created = send(db, trip.id, {
          kind: 'capture.create',
          input: { originalText: dependency },
          target:
            dependency === 'decision' || dependency === 'stayEdit'
              ? { mode: 'createStay', input: {} }
              : { mode: 'createJourney', input: {} },
        });
        const journey = created.receipt.journeys[0];
        const stay = created.receipt.stays[0];
        if (dependency === 'leg' && journey)
          createJourneyLeg(db, trip.id, journey.id, { mode: 'User transport mode' });
        if (dependency === 'group' && journey)
          createJourneyGroup(db, trip.id, { currentJourneyId: journey.id });
        if (dependency === 'stayEdit' && stay)
          updateStay(db, trip.id, stay.id, { notes: 'Independent new work' });
        if (dependency === 'decision' && stay) {
          const decision = createDecision(db, trip.id, {});
          createDecisionOption(
            db,
            { tripId: trip.id, id: decision.id },
            { affectedSources: [{ kind: 'stay', id: stay.id }] },
            decision.revision
          );
        }
        const before = readSourceWorkspace(db, trip.id);
        expect(() =>
          send(db, trip.id, { kind: 'undo', targetOperationId: created.receipt.operationId })
        ).toThrow('source_undo_conflict');
        expect(readSourceWorkspace(db, trip.id)).toEqual(before);
      }
    }));

  it('retains unresolved Contacts references and Undo removes only the Trips relation', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const reference = {
        uri: 'pops:contacts/contact/unavailable-owner-issued-reference',
        label: 'Owner source label',
      };
      const command = {
        kind: 'capture.create' as const,
        input: { originalText: 'Person source' },
        target: { mode: 'existing' as const, target: { kind: 'contact' as const, reference } },
      };
      const linked = send(db, trip.id, command);
      expect(linked.receipt.associations[0]?.target).toEqual({ kind: 'contact', reference });
      const before = readSourceWorkspace(db, trip.id);
      expect(() => send(db, trip.id, { ...command, explore: true })).toThrow(
        'source_target_invalid'
      );
      expect(readSourceWorkspace(db, trip.id)).toEqual(before);
      const undone = send(db, trip.id, {
        kind: 'undo',
        targetOperationId: linked.receipt.operationId,
      });
      expect(undone.receipt.associations[0]).toMatchObject({
        target: { kind: 'contact', reference },
        removedAt: expect.any(String),
      });
      expect(listVisits(db, trip.id)).toEqual([]);
    }));
});

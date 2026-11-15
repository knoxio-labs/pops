import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { events, journeys, meetingPlans, sourceOperations, stays, visits } from '../schema.js';
import {
  createDecision,
  createDecisionOption,
  deleteDecisionOption,
  restoreDecisionOption,
  updateDecisionOption,
} from '../services/decisions.js';
import { createJourney } from '../services/journeys.js';
import { getMeetingPlan } from '../services/meeting-plan-queries.js';
import { operateMeetingPlan } from '../services/meeting-plans.js';
import { createPlace, createTrip, createVisit } from '../services/records.js';
import { getCapture, getIdea } from '../services/source-queries.js';
import { send, withCaptureDb } from './capture-test-utils.js';

import type { SourceCommand } from '../../contract/source-workspace.js';

type LifecycleSourceKind = 'event' | 'journey' | 'stay';

function captureTarget(
  kind: LifecycleSourceKind
): NonNullable<Extract<SourceCommand, { kind: 'capture.create' }>['target']> {
  switch (kind) {
    case 'event':
      return { mode: 'createEvent', input: {} };
    case 'journey':
      return { mode: 'createJourney', input: {}, legs: [{}] };
    case 'stay':
      return { mode: 'createStay', input: {} };
  }
}

function sourceTable(kind: LifecycleSourceKind): typeof events | typeof journeys | typeof stays {
  switch (kind) {
    case 'event':
      return events;
    case 'journey':
      return journeys;
    case 'stay':
      return stays;
  }
}

const lifecycle = {
  removedAt: '2028-01-02T03:04:05.000Z',
  removalOperationId: 'b468c78b-ad59-4255-9864-fb50d24977f3',
  removalRevision: 1,
};

describe('Source removal replay and old Undo guards', () => {
  it.each(['event', 'journey', 'stay'] as const)(
    'keeps %s receipts immutable without replaying archived current facts or undoing a later lifecycle',
    (kind) =>
      withCaptureDb((db) => {
        const tripId = createTrip(db, {}).id;
        const command: SourceCommand = {
          kind: 'capture.create',
          input: { originalText: 'Preserved evidence' },
          target: captureTarget(kind),
        };
        const operationId = randomUUID();
        const original = send(db, tripId, command, operationId);
        const source =
          original.receipt.events[0] ?? original.receipt.journeys[0] ?? original.receipt.stays[0];
        if (source === undefined) throw new Error('Expected operation-created target');
        const table = sourceTable(kind);
        db.update(table).set(lifecycle).where(eq(table.id, source.id)).run();
        const replay = send(db, tripId, command, operationId);
        expect(replay.receipt).toEqual(original.receipt);
        expect(replay.current).toMatchObject({ events: [], journeys: [], stays: [] });
        if (kind === 'journey') expect(replay.current.journeyLegSets).toEqual([]);
        expect(() => send(db, tripId, { kind: 'undo', targetOperationId: operationId })).toThrow(
          'source_undo_conflict'
        );
        db.update(table)
          .set({ removedAt: null, removalOperationId: null, removalRevision: 2 })
          .where(eq(table.id, source.id))
          .run();
        expect(() => send(db, tripId, { kind: 'undo', targetOperationId: operationId })).toThrow(
          'source_undo_conflict'
        );
        expect(db.select().from(sourceOperations).all()).toHaveLength(1);
        expect(send(db, tripId, command, operationId).receipt).toEqual(original.receipt);
        expect(db.select().from(table).get()).toMatchObject({
          id: source.id,
          removedAt: null,
          removalRevision: 2,
        });
      })
  );

  it.each(['capture', 'idea'] as const)(
    'does not restore an old %s Visit reference after the occurrence was archived',
    (kind) =>
      withCaptureDb((db) => {
        const tripId = createTrip(db, {}).id;
        const visit = createVisit(db, tripId, {
          placeId: createPlace(db, { name: 'Occurrence' }).id,
        });
        const original =
          kind === 'capture'
            ? send(db, tripId, {
                kind: 'capture.create',
                input: { originalText: 'Evidence', visitId: visit.id },
              }).receipt.captures[0]
            : send(db, tripId, { kind: 'idea.create', input: { visitId: visit.id } }).receipt
                .ideas[0];
        if (original === undefined) throw new Error('Expected source');
        const removed = send(db, tripId, {
          kind: kind === 'capture' ? 'capture.remove' : 'idea.remove',
          id: original.id,
          expectedRevision: original.revision,
        });
        db.update(visits).set(lifecycle).where(eq(visits.id, visit.id)).run();
        expect(() =>
          send(db, tripId, { kind: 'undo', targetOperationId: removed.receipt.operationId })
        ).toThrow('source_undo_conflict');
        const current =
          kind === 'capture'
            ? getCapture(db, tripId, original.id)
            : getIdea(db, tripId, original.id);
        expect(current.removedAt).not.toBeNull();
        expect(current.revision).toBe(original.revision + 1);
      })
  );

  it('does not let Meeting own Undo adopt a draft-owned tombstone or restore a removed Visit reference', () =>
    withCaptureDb((db) => {
      const tripId = createTrip(db, {}).id;
      const visit = createVisit(db, tripId, {
        placeId: createPlace(db, { name: 'Occurrence' }).id,
      });
      const contactUri = 'pops:contacts/contact/source-lifecycle-test';
      const created = operateMeetingPlan(
        db,
        tripId,
        {
          operationId: randomUUID(),
          command: { kind: 'create', input: { contactUri, visitId: visit.id } },
        },
        contactUri
      );
      const remove = operateMeetingPlan(db, tripId, {
        operationId: randomUUID(),
        command: { kind: 'remove', id: created.current.id, expectedRevision: 1 },
      });
      db.update(meetingPlans)
        .set({ removalOperationId: lifecycle.removalOperationId })
        .where(eq(meetingPlans.id, created.current.id))
        .run();
      const undo = {
        operationId: randomUUID(),
        command: { kind: 'undo' as const, targetOperationId: remove.receipt.operationId },
      };
      expect(() => operateMeetingPlan(db, tripId, undo)).toThrow('meeting_undo_conflict');
      db.update(meetingPlans)
        .set({ removalOperationId: remove.receipt.operationId })
        .where(eq(meetingPlans.id, created.current.id))
        .run();
      db.update(visits).set(lifecycle).where(eq(visits.id, visit.id)).run();
      expect(() => operateMeetingPlan(db, tripId, undo)).toThrow('not_found');
      expect(() => getMeetingPlan(db, tripId, created.current.id)).toThrow('not_found');
      db.update(visits)
        .set({ removedAt: null, removalOperationId: null, removalRevision: 2 })
        .where(eq(visits.id, visit.id))
        .run();
      const restored = operateMeetingPlan(db, tripId, undo);
      const detached = operateMeetingPlan(db, tripId, {
        operationId: randomUUID(),
        command: {
          kind: 'update',
          id: created.current.id,
          expectedRevision: restored.current.revision,
          patch: { visitId: null },
        },
      }).current;
      db.update(visits)
        .set({ ...lifecycle, removalRevision: 3 })
        .where(eq(visits.id, visit.id))
        .run();
      expect(() =>
        operateMeetingPlan(db, tripId, {
          operationId: randomUUID(),
          command: {
            kind: 'update',
            id: created.current.id,
            expectedRevision: detached.revision,
            patch: { visitId: visit.id },
          },
        })
      ).toThrow('not_found');
    }));

  it('preserves accepted archived Decision references without admitting new historical ownership', () =>
    withCaptureDb((db) => {
      const tripId = createTrip(db, {}).id;
      const journey = createJourney(db, tripId, {});
      const decision = createDecision(db, tripId, {});
      const affectedSources = [{ kind: 'journey' as const, id: journey.id }];
      const option = createDecisionOption(db, { tripId, id: decision.id }, { affectedSources }, 0);
      db.update(journeys).set(lifecycle).where(eq(journeys.id, journey.id)).run();
      expect(() =>
        createDecisionOption(db, { tripId, id: decision.id }, { affectedSources }, 1)
      ).toThrow('not_found');
      const fresh = createDecisionOption(db, { tripId, id: decision.id }, {}, 1);
      expect(() =>
        updateDecisionOption(
          db,
          { tripId, decisionId: decision.id, id: fresh.id },
          { affectedSources },
          2
        )
      ).toThrow('not_found');
      const identity = { tripId, decisionId: decision.id, id: option.id };
      expect(updateDecisionOption(db, identity, { affectedSources }, 2).affectedSources).toEqual(
        affectedSources
      );
      expect(
        updateDecisionOption(db, identity, { affectedSources: [] }, 3).affectedSources
      ).toEqual([]);
      expect(updateDecisionOption(db, identity, { affectedSources }, 4).affectedSources).toEqual(
        affectedSources
      );
      expect(updateDecisionOption(db, identity, { notes: 'Unrelated edit' }, 5)).toMatchObject({
        notes: 'Unrelated edit',
        affectedSources,
      });
      deleteDecisionOption(db, identity, 6);
      expect(restoreDecisionOption(db, identity, 7, false).affectedSources).toEqual(
        affectedSources
      );
      expect(db.select().from(journeys).where(eq(journeys.id, journey.id)).get()).toMatchObject({
        ...lifecycle,
        tripId,
      });
    }));

  it('rejects foreign ownership of an archived Decision source even with accepted history', () =>
    withCaptureDb((db) => {
      const tripId = createTrip(db, {}).id;
      const otherTripId = createTrip(db, {}).id;
      const journey = createJourney(db, tripId, {});
      const decision = createDecision(db, tripId, {});
      const affectedSources = [{ kind: 'journey' as const, id: journey.id }];
      const option = createDecisionOption(db, { tripId, id: decision.id }, { affectedSources }, 0);
      db.update(journeys)
        .set({ ...lifecycle, tripId: otherTripId })
        .where(eq(journeys.id, journey.id))
        .run();
      expect(() =>
        updateDecisionOption(
          db,
          { tripId, decisionId: decision.id, id: option.id },
          { affectedSources },
          1
        )
      ).toThrow('not_found');
    }));
});

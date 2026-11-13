import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { CaptureCreateJourneyTargetSchema } from '../../contract/source-workspace.js';
import { journeyLegs, sourceOperations } from '../schema.js';
import { createJourneyGroup } from '../services/journey-groups.js';
import {
  createJourneyLeg,
  deleteJourneyLeg,
  reorderJourneyLegs,
  updateJourneyLeg,
} from '../services/journey-legs.js';
import { getJourney, listJourneys } from '../services/journeys.js';
import { removeJourneyLeg, restoreJourneyLeg } from '../services/leg-removals.js';
import { getJourneyLegSet } from '../services/leg-set.js';
import { createTrip, listVisits } from '../services/records.js';
import { listResponsibilities, replaceResponsibility } from '../services/responsibilities.js';
import { readSourceWorkspace } from '../services/source-queries.js';
import { send, withCaptureDb } from './capture-test-utils.js';

import type { JourneyLegInput } from '../../contract/journey-schemas.js';
import type { CaptureJourneyLegSet, SourceCommand } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

const LEGS: [JourneyLegInput, JourneyLegInput] = [
  {
    mode: 'Flight',
    operator: 'Fictional Air',
    service: 'FA101',
    reference: 'FIRST',
    from: { sourceLabel: 'Source airport A', local: '2028-01-06T23:40', timeZone: 'Europe/London' },
    to: { sourceLabel: 'Source airport B', date: '2028-01-07' },
    intention: 'In plan',
    arrangement: 'Booked',
    purchase: 'Purchased',
    notes: 'Original outbound fact',
    sourceLinks: [{ uri: 'https://example.test/original' }],
  },
  {
    mode: 'Flight',
    operator: 'Fictional Air',
    service: 'FA202',
    reference: 'SECOND',
    from: { sourceLabel: 'Source airport B', date: '2028-01-21' },
    to: { sourceLabel: 'Source airport A', local: '2028-01-21T19:10' },
  },
];

function command(legs: JourneyLegInput[] = LEGS): SourceCommand {
  return {
    kind: 'capture.create',
    input: { originalText: 'Verbatim fictional flight booking' },
    target: {
      mode: 'createJourney',
      input: { name: 'Explicit booking', reference: 'JOURNEY' },
      legs,
    },
  };
}

function createdProof(
  db: TripsDb,
  tripId: number
): { operationId: string; proof: CaptureJourneyLegSet } {
  const created = send(db, tripId, command());
  const proof = created.receipt.journeyLegSets?.[0];
  if (proof === undefined) throw new Error('Expected the complete created leg proof');
  return { operationId: created.receipt.operationId, proof };
}

function mutate(db: TripsDb, tripId: number, proof: CaptureJourneyLegSet, kind: string): void {
  const owner = { tripId, journeyId: proof.journeyId };
  const first = proof.legs[0];
  if (first === undefined) throw new Error('Expected a source leg');
  switch (kind) {
    case 'append':
      createJourneyLeg(db, tripId, proof.journeyId, { mode: 'Independent mode' });
      break;
    case 'edit':
      updateJourneyLeg(db, { ...owner, id: first.id }, { notes: 'Independent work' });
      break;
    case 'reorder-back': {
      const ids = proof.legs.map((leg) => leg.id);
      reorderJourneyLegs(db, tripId, proof.journeyId, {
        legIds: ids.toReversed(),
        expectedRevision: proof.revision,
      });
      reorderJourneyLegs(db, tripId, proof.journeyId, {
        legIds: ids,
        expectedRevision: proof.revision + 1,
      });
      break;
    }
    case 'remove-restore': {
      const operationId = randomUUID();
      removeJourneyLeg(
        db,
        { ...owner, id: first.id },
        { operationId, expectedRevision: proof.revision }
      );
      restoreJourneyLeg(db, { ...owner, operationId }, proof.revision + 1);
      break;
    }
    default:
      throw new Error('Unknown test mutation');
  }
}

describe('Atomic Capture Journey leg creation', () => {
  it('persists exact ordered leg facts and stable proof without creating route records or duplicates', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const operationId = randomUUID();
      const request = command();
      const created = send(db, trip.id, request, operationId);
      const proof = created.receipt.journeyLegSets?.[0];
      if (proof === undefined) throw new Error('Expected leg proof');
      expect(proof.revision).toBe(2);
      expect(proof.legs).toHaveLength(2);
      expect(proof.legs[0]).toMatchObject(LEGS[0]);
      expect(proof.legs[1]).toMatchObject(LEGS[1]);
      expect(created.current.journeyLegSets).toEqual([proof]);
      expect(getJourneyLegSet(db, trip.id, proof.journeyId)).toEqual({
        revision: 2,
        legs: proof.legs,
      });
      const replayed = send(db, trip.id, request, operationId);
      expect(replayed).toEqual({ ...created, replayed: true });
      expect(listJourneys(db, trip.id)).toHaveLength(1);
      expect(db.select().from(journeyLegs).all()).toHaveLength(2);
      expect(db.select().from(sourceOperations).all()).toHaveLength(1);
      expect(listVisits(db, trip.id)).toEqual([]);
      expect(() => send(db, trip.id, command(LEGS.toReversed()), operationId)).toThrow(
        'source_operation_mismatch'
      );
      expect(getJourneyLegSet(db, trip.id, proof.journeyId).legs).toEqual(proof.legs);
    }));

  it('uses the same atomic target for organising an existing capture', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const raw = send(db, trip.id, {
        kind: 'capture.create',
        input: { originalText: 'Preserved original' },
      }).receipt.captures[0];
      if (raw === undefined) throw new Error('Expected original capture');
      const organised = send(db, trip.id, {
        kind: 'capture.organise',
        id: raw.id,
        expectedRevision: raw.revision,
        target: { mode: 'createJourney', input: {}, legs: LEGS },
      });
      expect(organised.receipt.journeyLegSets?.[0]?.legs).toHaveLength(2);
      expect(organised.receipt.associations[0]).toMatchObject({
        captureId: raw.id,
        provenance: 'created',
      });
      expect(readSourceWorkspace(db, trip.id).captures[0]?.originalText).toBe(raw.originalText);
    }));

  it('rolls back every created row and receipt when a later leg has an unknown explicit place', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const before = readSourceWorkspace(db, trip.id);
      expect(() => send(db, trip.id, command([LEGS[0], { from: { placeId: 999999 } }]))).toThrow(
        'not_found'
      );
      expect(readSourceWorkspace(db, trip.id)).toEqual(before);
      expect(listJourneys(db, trip.id)).toEqual([]);
      expect(db.select().from(journeyLegs).all()).toEqual([]);
      expect(db.select().from(sourceOperations).all()).toEqual([]);
    }));

  it('undoes only its unchanged created legs and keeps the original receipt after historical replay', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const operationId = randomUUID();
      const request = command();
      const created = send(db, trip.id, request, operationId);
      const proof = created.receipt.journeyLegSets?.[0];
      if (proof === undefined) throw new Error('Expected leg proof');
      send(db, trip.id, { kind: 'undo', targetOperationId: operationId });
      expect(() => getJourney(db, trip.id, proof.journeyId)).toThrow('not_found');
      expect(db.select().from(journeyLegs).all()).toEqual([]);
      const replayed = send(db, trip.id, request, operationId);
      expect(replayed.receipt).toEqual(created.receipt);
      expect(replayed.current.journeys).toEqual([]);
      expect(replayed.current.journeyLegSets).toEqual([]);
      expect(replayed).toMatchObject({ replayed: true, undone: true });
      expect(listJourneys(db, trip.id)).toEqual([]);
    }));

  it.each(['append', 'edit', 'reorder-back', 'remove-restore'])(
    'refuses Undo after independent %s, including matching facts with advanced revision',
    (kind) =>
      withCaptureDb((db) => {
        const trip = createTrip(db, {});
        const { operationId, proof } = createdProof(db, trip.id);
        mutate(db, trip.id, proof, kind);
        const before = getJourneyLegSet(db, trip.id, proof.journeyId);
        expect(before.revision).toBeGreaterThan(proof.revision);
        if (kind === 'reorder-back' || kind === 'remove-restore')
          expect(before.legs).toEqual(proof.legs);
        expect(() => send(db, trip.id, { kind: 'undo', targetOperationId: operationId })).toThrow(
          'source_undo_conflict'
        );
        expect(getJourneyLegSet(db, trip.id, proof.journeyId)).toEqual(before);
        const replayed = send(db, trip.id, command(), operationId);
        expect(replayed.receipt.journeyLegSets).toEqual([proof]);
        expect(replayed.current.journeyLegSets).toEqual([
          { journeyId: proof.journeyId, ...before },
        ]);
        expect(replayed.undone).toBe(false);
      })
  );

  it('rolls back provisional own-leg removal when an existing group dependency refuses Undo', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const { operationId, proof } = createdProof(db, trip.id);
      createJourneyGroup(db, trip.id, { currentJourneyId: proof.journeyId });
      expect(() => send(db, trip.id, { kind: 'undo', targetOperationId: operationId })).toThrow(
        'source_undo_conflict'
      );
      expect(getJourneyLegSet(db, trip.id, proof.journeyId)).toEqual({
        revision: proof.revision,
        legs: proof.legs,
      });
      expect(send(db, trip.id, command(), operationId).undone).toBe(false);
    }));

  it.each(['self', 'contact'])(
    'retains independent %s responsibility and every provisional own leg until explicit clear',
    (kind) =>
      withCaptureDb((db) => {
        const trip = createTrip(db, {});
        const { operationId, proof } = createdProof(db, trip.id);
        const target: { kind: 'journey'; id: number } = { kind: 'journey', id: proof.journeyId };
        replaceResponsibility(db, trip.id, target, {
          expectedRevision: 0,
          responsibility:
            kind === 'self'
              ? { kind: 'self' }
              : { kind: 'contact', uri: 'pops:contacts/contact/owner-issued' },
        });
        const before = readSourceWorkspace(db, trip.id);
        const responsibilities = listResponsibilities(db, trip.id);
        const receipts = db.select().from(sourceOperations).all();
        const undoId = randomUUID();
        const undo: SourceCommand = { kind: 'undo', targetOperationId: operationId };
        expect(() => send(db, trip.id, undo, undoId)).toThrow('source_undo_conflict');
        expect(readSourceWorkspace(db, trip.id)).toEqual(before);
        expect(listResponsibilities(db, trip.id)).toEqual(responsibilities);
        expect(db.select().from(sourceOperations).all()).toEqual(receipts);
        expect(getJourneyLegSet(db, trip.id, proof.journeyId)).toEqual({
          revision: proof.revision,
          legs: proof.legs,
        });
        replaceResponsibility(db, trip.id, target, { expectedRevision: 1, responsibility: null });
        send(db, trip.id, undo, undoId);
        expect(() => getJourney(db, trip.id, proof.journeyId)).toThrow('not_found');
        expect(send(db, trip.id, undo, undoId).replayed).toBe(true);
      })
  );

  it('does not treat an explicit empty set as permission to erase later leg history', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const created = send(db, trip.id, command([]));
      const proof = created.receipt.journeyLegSets?.[0];
      if (proof === undefined) throw new Error('Expected explicit empty-set proof');
      expect(proof).toMatchObject({ revision: 0, legs: [] });
      const later = createJourneyLeg(db, trip.id, proof.journeyId, {});
      deleteJourneyLeg(db, trip.id, proof.journeyId, later.id);
      expect(() =>
        send(db, trip.id, { kind: 'undo', targetOperationId: created.receipt.operationId })
      ).toThrow('source_undo_conflict');
      expect(getJourneyLegSet(db, trip.id, proof.journeyId)).toEqual({ revision: 2, legs: [] });
    }));

  it('validates each canonical leg without silently promoting day-only precision', () => {
    const parsed = CaptureCreateJourneyTargetSchema.parse({
      mode: 'createJourney',
      input: {},
      legs: LEGS,
    });
    expect(parsed.legs?.[0]?.to).toEqual({ sourceLabel: 'Source airport B', date: '2028-01-07' });
    expect(() =>
      CaptureCreateJourneyTargetSchema.parse({
        mode: 'createJourney',
        input: {},
        legs: [{ from: { date: '2028-01-06', local: '2028-01-06T10:00' } }],
      })
    ).toThrow();
    expect(() =>
      CaptureCreateJourneyTargetSchema.parse({
        mode: 'createJourney',
        input: {},
        legs: [{ to: { date: '2028-02-31' } }],
      })
    ).toThrow();
  });

  it('preserves legacy omitted-leg replay/Undo and distinguishes explicit empty legs under the same UUID', () =>
    withCaptureDb((db) => {
      const trip = createTrip(db, {});
      const operationId = randomUUID();
      const request: SourceCommand = {
        kind: 'capture.create',
        input: { originalText: 'Legacy original' },
        target: { mode: 'createJourney', input: {} },
      };
      const created = send(db, trip.id, request, operationId);
      expect(created.receipt).not.toHaveProperty('journeyLegSets');
      expect(db.select().from(sourceOperations).all()[0]?.inverse).not.toHaveProperty(
        'createdJourneyLegSets'
      );
      expect(send(db, trip.id, request, operationId).receipt).toEqual(created.receipt);
      expect(() =>
        send(
          db,
          trip.id,
          { ...request, target: { mode: 'createJourney', input: {}, legs: [] } },
          operationId
        )
      ).toThrow('source_operation_mismatch');
      send(db, trip.id, { kind: 'undo', targetOperationId: operationId });
      expect(send(db, trip.id, request, operationId)).toMatchObject({
        replayed: true,
        undone: true,
      });
      expect(
        CaptureCreateJourneyTargetSchema.parse({ mode: 'createJourney', input: {} })
      ).not.toHaveProperty('legs');
    }));
});

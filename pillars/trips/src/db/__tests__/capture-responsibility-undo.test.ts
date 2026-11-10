import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sourceOperations } from '../schema.js';
import { getEvent } from '../services/events.js';
import { createJourney, getJourney } from '../services/journeys.js';
import { createTrip } from '../services/records.js';
import { listResponsibilities, replaceResponsibility } from '../services/responsibilities.js';
import { readSourceWorkspace } from '../services/source-queries.js';
import { getStay } from '../services/stays.js';
import { send, withCaptureDb } from './capture-test-utils.js';

import type { Responsibility } from '../../contract/responsibilities.js';
import type { SourceCommand } from '../../contract/source-workspace.js';
import type { TripsDb } from '../index.js';

type Kind = 'journey' | 'stay' | 'event';

function createTarget(db: TripsDb, tripId: number, kind: Kind) {
  const targets: Record<Kind, Extract<SourceCommand, { kind: 'capture.create' }>['target']> = {
    journey: { mode: 'createJourney', input: { name: 'Explicit journey' } },
    stay: { mode: 'createStay', input: { name: 'Explicit stay' } },
    event: { mode: 'createEvent', input: { name: 'Explicit event' } },
  };
  const created = send(db, tripId, {
    kind: 'capture.create',
    input: { originalText: 'Raw retained source' },
    target: targets[kind],
  });
  const row = {
    journey: created.receipt.journeys[0],
    stay: created.receipt.stays[0],
    event: created.receipt.events[0],
  }[kind];
  if (!row) throw new Error('Expected explicitly created target');
  return { operationId: created.receipt.operationId, target: { kind, id: row.id } };
}

function readTarget(db: TripsDb, tripId: number, target: { kind: Kind; id: number }) {
  switch (target.kind) {
    case 'journey':
      return getJourney(db, tripId, target.id);
    case 'stay':
      return getStay(db, tripId, target.id);
    case 'event':
      return getEvent(db, tripId, target.id);
  }
}

describe.each(['journey', 'stay', 'event'] as const)(
  'Capture-created %s responsibility',
  (kind) => {
    it.each(['self', 'contact'] as const)(
      'rejects Undo atomically with independent %s work and permits the exact retry only after explicit clear',
      (owner) =>
        withCaptureDb((db) => {
          const trip = createTrip(db, {});
          const created = createTarget(db, trip.id, kind);
          const responsibility: Responsibility =
            owner === 'self'
              ? { kind: 'self' }
              : { kind: 'contact', uri: 'pops:contacts/contact/owner-issued' };
          replaceResponsibility(db, trip.id, created.target, {
            expectedRevision: 0,
            responsibility,
          });
          const before = readSourceWorkspace(db, trip.id);
          const responsibilities = listResponsibilities(db, trip.id);
          const receipts = db.select().from(sourceOperations).all();
          const undoId = randomUUID();
          const undo = { kind: 'undo' as const, targetOperationId: created.operationId };
          for (let attempt = 0; attempt < 2; attempt += 1) {
            expect(() => send(db, trip.id, undo, undoId)).toThrow('source_undo_conflict');
            expect(readSourceWorkspace(db, trip.id)).toEqual(before);
            expect(listResponsibilities(db, trip.id)).toEqual(responsibilities);
            expect(db.select().from(sourceOperations).all()).toEqual(receipts);
          }
          replaceResponsibility(db, trip.id, created.target, {
            expectedRevision: 1,
            responsibility: null,
          });
          send(db, trip.id, undo, undoId);
          expect(() => readTarget(db, trip.id, created.target)).toThrow('not_found');
          expect(readSourceWorkspace(db, trip.id).captures[0]).toMatchObject({
            originalText: 'Raw retained source',
            removedAt: expect.any(String),
          });
          expect(send(db, trip.id, undo, undoId).replayed).toBe(true);
        })
    );
  }
);

it('does not borrow a responsibility from another kind with the same numeric target ID', () =>
  withCaptureDb((db) => {
    const trip = createTrip(db, {});
    const journey = createJourney(db, trip.id, {});
    replaceResponsibility(
      db,
      trip.id,
      { kind: 'journey', id: journey.id },
      { expectedRevision: 0, responsibility: { kind: 'self' } }
    );
    const created = createTarget(db, trip.id, 'stay');
    expect(created.target.id).toBe(journey.id);
    const responsibilities = listResponsibilities(db, trip.id);
    send(db, trip.id, { kind: 'undo', targetOperationId: created.operationId });
    expect(getJourney(db, trip.id, journey.id)).toEqual(journey);
    expect(listResponsibilities(db, trip.id)).toEqual(responsibilities);
  }));

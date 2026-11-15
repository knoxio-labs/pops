import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { events, journeys, sourceOperations, stays } from '../schema.js';
import { createEvent, updateEvent } from '../services/events.js';
import { createJourney, updateJourney } from '../services/journeys.js';
import { createTrip } from '../services/records.js';
import { createStay, updateStay } from '../services/stays.js';
import { send, withCaptureDb } from './capture-test-utils.js';

import type { SourceCommand } from '../../contract/source-workspace.js';

type WritableSource =
  | ReturnType<typeof createEvent>
  | ReturnType<typeof createJourney>
  | ReturnType<typeof createStay>;
type WritableSourceKind = 'event' | 'journey' | 'stay';

function captureTarget(
  kind: WritableSourceKind
): NonNullable<Extract<SourceCommand, { kind: 'capture.create' }>['target']> {
  switch (kind) {
    case 'event':
      return { mode: 'createEvent', input: {} };
    case 'journey':
      return { mode: 'createJourney', input: {} };
    case 'stay':
      return { mode: 'createStay', input: {} };
  }
}

function sourceTable(kind: WritableSourceKind): typeof events | typeof journeys | typeof stays {
  switch (kind) {
    case 'event':
      return events;
    case 'journey':
      return journeys;
    case 'stay':
      return stays;
  }
}

function updateSource(
  db: Parameters<typeof updateEvent>[0],
  tripId: number,
  kind: WritableSourceKind,
  id: number,
  input: { notes?: string } = {}
): WritableSource {
  switch (kind) {
    case 'event':
      return updateEvent(db, tripId, id, input);
    case 'journey':
      return updateJourney(db, tripId, id, input);
    case 'stay':
      return updateStay(db, tripId, id, input);
  }
}

function createSource(
  db: Parameters<typeof createEvent>[0],
  tripId: number,
  kind: WritableSourceKind
): WritableSource {
  switch (kind) {
    case 'event':
      return createEvent(db, tripId, { notes: 'Original' });
    case 'journey':
      return createJourney(db, tripId, { notes: 'Original' });
    case 'stay':
      return createStay(db, tripId, { notes: 'Original' });
  }
}

describe('Private source write generation', () => {
  it.each(['event', 'journey', 'stay'] as const)(
    'detects an identical %s write with the same updatedAt before undoing source creation',
    (kind) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2028-01-02T03:04:05.000Z'));
      try {
        withCaptureDb((db) => {
          const tripId = createTrip(db, {}).id;
          const created = send(db, tripId, {
            kind: 'capture.create',
            input: { originalText: 'Retained original' },
            target: captureTarget(kind),
          });
          const original =
            created.receipt.events[0] ?? created.receipt.journeys[0] ?? created.receipt.stays[0];
          if (original === undefined) throw new Error('Expected source');
          expect(updateSource(db, tripId, kind, original.id)).toEqual(original);
          const table = sourceTable(kind);
          expect(
            db
              .select({ generation: table.removalRevision })
              .from(table)
              .where(eq(table.id, original.id))
              .get()
          ).toEqual({ generation: 1 });
          expect(() =>
            send(db, tripId, { kind: 'undo', targetOperationId: created.receipt.operationId })
          ).toThrow('source_undo_conflict');
          expect(db.select().from(sourceOperations).all()).toHaveLength(1);
        });
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it.each(['event', 'journey', 'stay'] as const)(
    'refuses exhausted or invalid %s generations without changing source fields',
    (kind) =>
      withCaptureDb((db) => {
        const tripId = createTrip(db, {}).id;
        const source = createSource(db, tripId, kind);
        const table = sourceTable(kind);
        db.update(table)
          .set({ removalRevision: Number.MAX_SAFE_INTEGER - 1 })
          .where(eq(table.id, source.id))
          .run();
        updateSource(db, tripId, kind, source.id);
        expect(
          db
            .select({ generation: table.removalRevision })
            .from(table)
            .where(eq(table.id, source.id))
            .get()
        ).toEqual({ generation: Number.MAX_SAFE_INTEGER });
        for (const removalRevision of [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, -1]) {
          db.update(table).set({ removalRevision }).where(eq(table.id, source.id)).run();
          const before = db.select().from(table).where(eq(table.id, source.id)).get();
          expect(() => updateSource(db, tripId, kind, source.id, { notes: 'Rejected' })).toThrow(
            'source_revision_conflict'
          );
          expect(db.select().from(table).where(eq(table.id, source.id)).get()).toEqual(before);
        }
      })
  );
});

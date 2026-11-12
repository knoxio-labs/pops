import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { journeys, journeyLegs, legRemovals } from '../schema.js';
import {
  createJourneyLeg,
  deleteJourneyLeg,
  getJourneyLeg,
  updateJourneyLeg,
  reorderJourneyLegs,
} from '../services/journey-legs.js';
import { getJourneyTiming } from '../services/journey-timing.js';
import { createJourney, deleteJourney } from '../services/journeys.js';
import { removeJourneyLeg, restoreJourneyLeg } from '../services/leg-removals.js';
import { getJourneyLegSet } from '../services/leg-set.js';
import { createTrip } from '../services/records.js';

let opened: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'leg-removals-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const db = opened.db;
  const trip = createTrip(db, {});
  const journey = createJourney(db, trip.id, {});
  const first = createJourneyLeg(db, trip.id, journey.id, { notes: 'retained source' });
  const second = createJourneyLeg(db, trip.id, journey.id, {});
  return { db, trip, journey, first, second, owner: { tripId: trip.id, journeyId: journey.id } };
}
const operationId = '11111111-1111-4111-8111-111111111111';
const otherOperationId = '22222222-2222-4222-8222-222222222222';

describe('identity-preserving leg removal receipts', () => {
  it('restores original day-only facts after reopen without rewriting a pre-existing receipt', () => {
    const { db, owner, first } = fixture();
    const source = updateJourneyLeg(
      db,
      { ...owner, id: first.id },
      { from: { date: '2028-02-29' } }
    );
    const removed = removeJourneyLeg(
      db,
      { ...owner, id: first.id },
      { operationId, expectedRevision: 3 }
    );
    const receipt = db.select().from(legRemovals).all();
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    expect(
      removeJourneyLeg(opened.db, { ...owner, id: first.id }, { operationId, expectedRevision: 3 })
    ).toEqual(removed);
    expect(opened.db.select().from(legRemovals).all()).toEqual(receipt);
    const restored = restoreJourneyLeg(opened.db, { ...owner, operationId }, 4);
    expect(restored.legs[0]).toEqual(source);
    expect(restored.legs[0]?.from).toEqual({ date: '2028-02-29' });
  });
  it('replays exact intent without changing identity, source or a later lifecycle', () => {
    const { db, owner, first, second } = fixture();
    const input = { operationId, expectedRevision: 2 };
    const removed = removeJourneyLeg(db, { ...owner, id: first.id }, input);
    expect(removed).toMatchObject({
      revision: 3,
      legs: [second],
      receipt: { state: 'removed', legId: first.id },
    });
    expect(() => getJourneyLeg(db, owner.tripId, owner.journeyId, first.id)).toThrow('not_found');
    expect(
      getJourneyTiming(db, owner.tripId, owner.journeyId).legs.map((leg) => leg.legId)
    ).toEqual([second.id]);
    expect(removeJourneyLeg(db, { ...owner, id: first.id }, input)).toEqual(removed);
    const restored = restoreJourneyLeg(db, { ...owner, operationId }, 3);
    expect(restored).toMatchObject({
      revision: 4,
      legs: [first, second],
      receipt: { state: 'restored' },
    });
    expect(restoreJourneyLeg(db, { ...owner, operationId }, 3)).toEqual(restored);
    removeJourneyLeg(
      db,
      { ...owner, id: first.id },
      { operationId: otherOperationId, expectedRevision: 4 }
    );
    expect(restoreJourneyLeg(db, { ...owner, operationId }, 3)).toMatchObject({
      revision: 5,
      legs: [second],
    });
    expect(removeJourneyLeg(db, { ...owner, id: first.id }, input)).toMatchObject({
      revision: 5,
      legs: [second],
    });
    expect(() => removeJourneyLeg(db, { ...owner, id: second.id }, input)).toThrow(
      'leg_removal_conflict'
    );
  });

  it('restores multiple removals in LIFO order and rejects stale or reordered collections atomically', () => {
    const { db, owner, first, second } = fixture();
    removeJourneyLeg(db, { ...owner, id: first.id }, { operationId, expectedRevision: 2 });
    removeJourneyLeg(
      db,
      { ...owner, id: second.id },
      { operationId: otherOperationId, expectedRevision: 3 }
    );
    expect(() => restoreJourneyLeg(db, { ...owner, operationId }, 4)).toThrow('leg_order_conflict');
    expect(getJourneyLegSet(db, owner.tripId, owner.journeyId)).toEqual({ revision: 4, legs: [] });
    restoreJourneyLeg(db, { ...owner, operationId: otherOperationId }, 4);
    restoreJourneyLeg(db, { ...owner, operationId }, 5);
    expect(getJourneyLegSet(db, owner.tripId, owner.journeyId)).toEqual({
      revision: 6,
      legs: [first, second],
    });
    expect(() =>
      reorderJourneyLegs(db, owner.tripId, owner.journeyId, {
        legIds: [second.id, first.id],
        expectedRevision: 5,
      })
    ).toThrow('leg_revision_conflict');
  });

  it('rejects exhausted revisions before source, ordering or receipt writes', () => {
    const { db, owner, journey, first, second } = fixture();
    db.update(journeys)
      .set({ legRevision: Number.MAX_SAFE_INTEGER })
      .where(eq(journeys.id, journey.id))
      .run();
    expect(() =>
      updateJourneyLeg(
        db,
        { ...owner, id: first.id },
        {
          notes: 'lost',
          expectedRevision: Number.MAX_SAFE_INTEGER,
        }
      )
    ).toThrow('leg_revision_conflict');
    expect(() =>
      removeJourneyLeg(
        db,
        { ...owner, id: first.id },
        { operationId, expectedRevision: Number.MAX_SAFE_INTEGER }
      )
    ).toThrow('leg_revision_conflict');
    expect(db.select().from(legRemovals).all()).toEqual([]);
    expect(getJourneyLegSet(db, owner.tripId, owner.journeyId)).toEqual({
      revision: Number.MAX_SAFE_INTEGER,
      legs: [first, second],
    });
    expect(db.select().from(journeyLegs).where(eq(journeyLegs.id, first.id)).get()).toMatchObject({
      removedAt: null,
      notes: first.notes,
    });
  });
  it('rejects foreign ownership and changed replay intent without touching the original lifecycle', () => {
    const { db, owner, first, second } = fixture();
    const trip = createTrip(db, {});
    const foreignJourney = createJourney(db, trip.id, {});
    removeJourneyLeg(db, { ...owner, id: first.id }, { operationId, expectedRevision: 2 });
    expect(() =>
      restoreJourneyLeg(db, { tripId: trip.id, journeyId: owner.journeyId, operationId }, 3)
    ).toThrow('not_found');
    expect(() =>
      restoreJourneyLeg(db, { tripId: trip.id, journeyId: foreignJourney.id, operationId }, 3)
    ).toThrow('not_found');
    expect(() =>
      removeJourneyLeg(db, { ...owner, id: first.id }, { operationId, expectedRevision: 3 })
    ).toThrow('leg_removal_conflict');
    expect(() => restoreJourneyLeg(db, { ...owner, operationId }, 2)).toThrow(
      'leg_revision_conflict'
    );
    expect(getJourneyLegSet(db, owner.tripId, owner.journeyId)).toEqual({
      revision: 3,
      legs: [second],
    });
  });

  it('preserves an archived source and pending receipt when restoration cannot advance safely', () => {
    const { db, owner, journey, first, second } = fixture();
    removeJourneyLeg(db, { ...owner, id: first.id }, { operationId, expectedRevision: 2 });
    db.update(journeys)
      .set({ legRevision: Number.MAX_SAFE_INTEGER })
      .where(eq(journeys.id, journey.id))
      .run();
    const receipt = db.select().from(legRemovals).all();
    expect(() => restoreJourneyLeg(db, { ...owner, operationId }, Number.MAX_SAFE_INTEGER)).toThrow(
      'leg_revision_conflict'
    );
    expect(db.select().from(legRemovals).all()).toEqual(receipt);
    expect(getJourneyLegSet(db, owner.tripId, owner.journeyId)).toEqual({
      revision: Number.MAX_SAFE_INTEGER,
      legs: [second],
    });
    expect(
      removeJourneyLeg(db, { ...owner, id: first.id }, { operationId, expectedRevision: 2 })
    ).toMatchObject({ revision: Number.MAX_SAFE_INTEGER, legs: [second] });
    expect(() => createJourneyLeg(db, owner.tripId, owner.journeyId, {})).toThrow(
      'leg_revision_conflict'
    );
    expect(() => reorderJourneyLegs(db, owner.tripId, owner.journeyId, [second.id])).toThrow(
      'leg_revision_conflict'
    );
    expect(() => deleteJourneyLeg(db, owner.tripId, owner.journeyId, second.id)).toThrow(
      'leg_revision_conflict'
    );
    expect(getJourneyLegSet(db, owner.tripId, owner.journeyId)).toEqual({
      revision: Number.MAX_SAFE_INTEGER,
      legs: [second],
    });
  });
  it('retains exact receipts and archived identity across database reopen', () => {
    const { db, owner, first, second } = fixture();
    removeJourneyLeg(db, { ...owner, id: first.id }, { operationId, expectedRevision: 2 });
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    const restored = restoreJourneyLeg(opened.db, { ...owner, operationId }, 3);
    expect(restored).toMatchObject({ revision: 4, legs: [first, second] });
    expect(restoreJourneyLeg(opened.db, { ...owner, operationId }, 3)).toEqual(restored);
    expect(opened.db.select().from(legRemovals).all()).toHaveLength(1);
  });

  it('purges only the explicitly deleted parent source and refuses its old receipts', () => {
    const { db, owner, first } = fixture();
    removeJourneyLeg(db, { ...owner, id: first.id }, { operationId, expectedRevision: 2 });
    const otherJourney = createJourney(db, owner.tripId, {});
    const otherLeg = createJourneyLeg(db, owner.tripId, otherJourney.id, {});
    deleteJourney(db, owner.tripId, owner.journeyId);
    expect(db.select().from(legRemovals).all()).toEqual([]);
    expect(db.select().from(journeyLegs).all()).toEqual([
      expect.objectContaining({ id: otherLeg.id }),
    ]);
    expect(() => restoreJourneyLeg(db, { ...owner, operationId }, 3)).toThrow('not_found');
  });
});

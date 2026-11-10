import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { decisionOptions, journeys } from '../schema.js';
import { getDecision, getDecisionOption } from '../services/decision-queries.js';
import {
  createDecision,
  createDecisionOption,
  deleteDecisionOption,
  restoreDecisionOption,
  updateDecisionOption,
} from '../services/decisions.js';
import { createJourney, deleteJourney } from '../services/journeys.js';
import { createTrip } from '../services/records.js';

let opened: OpenedTripsDb;
beforeEach(() => {
  opened = openTripsDb(':memory:');
});
afterEach(() => {
  opened.raw.close();
});

it('preserves validated option membership through unlink, tombstone and restore without admitting arbitrary missing references', () => {
  const db = opened.db;
  const tripId = createTrip(db, {}).id;
  const decisionId = createDecision(db, tripId, {}).id;
  const journey = createJourney(db, tripId, {});
  const affectedSources = [{ kind: 'journey' as const, id: journey.id }];
  const option = createDecisionOption(db, { tripId, id: decisionId }, { affectedSources }, 0);
  const identity = { tripId, decisionId, id: option.id };
  deleteJourney(db, tripId, journey.id);
  updateDecisionOption(db, identity, { affectedSources: [] }, 1);
  expect(updateDecisionOption(db, identity, { affectedSources }, 2).affectedSources).toEqual(
    affectedSources
  );
  deleteDecisionOption(db, identity, 3);
  expect(restoreDecisionOption(db, identity, 4, false).affectedSources).toEqual(affectedSources);
  updateDecisionOption(db, identity, { affectedSources: [] }, 5);
  expect(updateDecisionOption(db, identity, { affectedSources }, 6).affectedSources).toEqual(
    affectedSources
  );
  expect(() => updateDecisionOption(db, identity, { affectedSources: [] }, 6)).toThrow(
    'decision_revision_conflict'
  );
  expect(() =>
    createDecisionOption(db, { tripId, id: decisionId }, { affectedSources }, 7)
  ).toThrow('not_found');
  expect(getDecision(db, tripId, decisionId).revision).toBe(7);
  expect(getDecisionOption(db, tripId, decisionId, option.id).affectedSources).toEqual(
    affectedSources
  );
});
it('rolls back attempted history additions and other fields atomically on missing or foreign sources', () => {
  const db = opened.db;
  const tripId = createTrip(db, {}).id;
  const decisionId = createDecision(db, tripId, {}).id;
  const option = createDecisionOption(db, { tripId, id: decisionId }, {}, 0);
  const identity = { tripId, decisionId, id: option.id };
  const valid = createJourney(db, tripId, {});
  const foreign = createJourney(db, createTrip(db, {}).id, {});
  for (const id of [foreign.id, foreign.id + 1]) {
    expect(() =>
      updateDecisionOption(
        db,
        identity,
        {
          notes: 'Must roll back',
          affectedSources: [
            { kind: 'journey', id: valid.id },
            { kind: 'journey', id },
          ],
        },
        1
      )
    ).toThrow('not_found');
    expect(getDecision(db, tripId, decisionId).revision).toBe(1);
    expect(getDecisionOption(db, tripId, decisionId, option.id)).toEqual(option);
    expect(
      db.select().from(decisionOptions).where(eq(decisionOptions.id, option.id)).get()
        ?.validatedSources
    ).toEqual([]);
  }
  deleteJourney(db, tripId, valid.id);
  expect(() =>
    updateDecisionOption(db, identity, { affectedSources: [{ kind: 'journey', id: valid.id }] }, 1)
  ).toThrow('not_found');
});
it('rejects currently live foreign ownership even when the exact identity was previously accepted', () => {
  const db = opened.db;
  const tripId = createTrip(db, {}).id;
  const decisionId = createDecision(db, tripId, {}).id;
  const journey = createJourney(db, tripId, {});
  const affectedSources = [{ kind: 'journey' as const, id: journey.id }];
  const option = createDecisionOption(db, { tripId, id: decisionId }, { affectedSources }, 0);
  const identity = { tripId, decisionId, id: option.id };
  updateDecisionOption(db, identity, { affectedSources: [] }, 1);
  db.update(journeys)
    .set({ tripId: createTrip(db, {}).id })
    .where(eq(journeys.id, journey.id))
    .run();
  expect(() => updateDecisionOption(db, identity, { affectedSources }, 2)).toThrow('not_found');
  expect(getDecision(db, tripId, decisionId).revision).toBe(2);
  expect(getDecisionOption(db, tripId, decisionId, option.id).affectedSources).toEqual([]);
  db.update(decisionOptions)
    .set({ affectedSources })
    .where(eq(decisionOptions.id, option.id))
    .run();
  deleteDecisionOption(db, identity, 2);
  expect(() => restoreDecisionOption(db, identity, 3, false)).toThrow('not_found');
  expect(getDecision(db, tripId, decisionId).revision).toBe(3);
  expect(
    db.select().from(decisionOptions).where(eq(decisionOptions.id, option.id)).get()?.removedAt
  ).not.toBeNull();
});

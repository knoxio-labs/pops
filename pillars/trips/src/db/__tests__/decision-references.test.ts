import { afterEach, beforeEach, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { getDecision, getDecisionOption } from '../services/decision-queries.js';
import {
  createDecision,
  createDecisionOption,
  updateDecisionOption,
} from '../services/decisions.js';
import { createJourney, deleteJourney } from '../services/journeys.js';
import { createTrip } from '../services/records.js';
import { createStay } from '../services/stays.js';

let opened: OpenedTripsDb;
beforeEach(() => {
  opened = openTripsDb(':memory:');
});
afterEach(() => {
  opened.raw.close();
});

it('removes a reference while retaining another missing identity, and validates only added memberships atomically', () => {
  const db = opened.db;
  const tripId = createTrip(db, {}).id;
  const decisionId = createDecision(db, tripId, {}).id;
  const first = createJourney(db, tripId, {});
  const retained = createJourney(db, tripId, {});
  const added = createJourney(db, tripId, {});
  const option = createDecisionOption(
    db,
    { tripId, id: decisionId },
    {
      affectedSources: [
        { kind: 'journey', id: first.id },
        { kind: 'journey', id: retained.id },
      ],
    },
    0
  );
  deleteJourney(db, tripId, first.id);
  deleteJourney(db, tripId, retained.id);
  const identity = { tripId, decisionId, id: option.id };
  updateDecisionOption(
    db,
    identity,
    { affectedSources: [{ kind: 'journey', id: retained.id }] },
    1
  );
  const affectedSources = [
    { kind: 'journey' as const, id: retained.id },
    { kind: 'journey' as const, id: added.id },
  ];
  expect(updateDecisionOption(db, identity, { affectedSources }, 2).affectedSources).toEqual(
    affectedSources
  );
  const foreignTrip = createTrip(db, {}).id;
  const foreign = createJourney(db, foreignTrip, {});
  for (const id of [foreign.id, foreign.id + 1]) {
    expect(() =>
      updateDecisionOption(
        db,
        identity,
        { affectedSources: [...affectedSources, { kind: 'journey', id }] },
        3
      )
    ).toThrow('not_found');
    expect(getDecision(db, tripId, decisionId).revision).toBe(3);
    expect(getDecisionOption(db, tripId, decisionId, option.id).affectedSources).toEqual(
      affectedSources
    );
  }
  expect(() =>
    createDecisionOption(
      db,
      { tripId, id: decisionId },
      { affectedSources: [{ kind: 'journey', id: retained.id }] },
      3
    )
  ).toThrow('not_found');
});
it('does not confuse an unchanged numeric ID with an added foreign membership of another kind', () => {
  const db = opened.db;
  const tripId = createTrip(db, {}).id;
  const decisionId = createDecision(db, tripId, {}).id;
  const journey = createJourney(db, tripId, {});
  const option = createDecisionOption(
    db,
    { tripId, id: decisionId },
    { affectedSources: [{ kind: 'journey', id: journey.id }] },
    0
  );
  const foreignStay = createStay(db, createTrip(db, {}).id, {});
  expect(foreignStay.id).toBe(journey.id);
  expect(() =>
    updateDecisionOption(
      db,
      { tripId, decisionId, id: option.id },
      { affectedSources: [{ kind: 'stay', id: foreignStay.id }] },
      1
    )
  ).toThrow('not_found');
  expect(getDecisionOption(db, tripId, decisionId, option.id)).toEqual(option);
});

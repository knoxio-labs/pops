import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import {
  getDecision,
  getDecisionOption,
  listDecisionOptions,
} from '../services/decision-queries.js';
import {
  createDecision,
  createDecisionOption,
  deleteDecision,
  deleteDecisionOption,
  restoreDecisionOption,
  selectDecisionOption,
} from '../services/decisions.js';
import { createJourney, getJourney } from '../services/journeys.js';
import { createTrip } from '../services/records.js';

let opened: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'decision-restore-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const db = opened.db;
  const tripId = createTrip(db, {}).id;
  const decisionId = createDecision(db, tripId, {}).id;
  const journey = createJourney(db, tripId, { notes: 'Source unchanged' });
  const option = createDecisionOption(
    db,
    { tripId, id: decisionId },
    {
      title: 'Original',
      notes: 'Retained',
      affectedSources: [{ kind: 'journey', id: journey.id }],
      sourceLinks: [{ uri: 'https://example.com' }],
    },
    0
  );
  selectDecisionOption(db, { tripId, id: decisionId }, option.id, 1);
  const identity = { tripId, decisionId, id: option.id };
  deleteDecisionOption(db, identity, 2);
  return { db, identity, option, journey };
}
it('retains removed identity and source facts, selecting only on an explicit atomic restore', () => {
  const { db, identity, option, journey } = fixture();
  expect(listDecisionOptions(db, identity.tripId, identity.decisionId)).toEqual([]);
  expect(() => getDecisionOption(db, identity.tripId, identity.decisionId, option.id)).toThrow(
    'not_found'
  );
  const restored = restoreDecisionOption(db, identity, 3, false);
  expect(restored).toMatchObject({
    id: option.id,
    decisionId: option.decisionId,
    title: option.title,
    notes: option.notes,
    affectedSources: option.affectedSources,
    sourceLinks: option.sourceLinks,
    createdAt: option.createdAt,
  });
  expect(getDecision(db, identity.tripId, identity.decisionId)).toMatchObject({
    revision: 4,
    selectedOptionId: null,
  });
  expect(() => restoreDecisionOption(db, identity, 4, true)).toThrow('option_not_removed');
  expect(getDecision(db, identity.tripId, identity.decisionId).revision).toBe(4);
  deleteDecisionOption(db, identity, 4);
  restoreDecisionOption(db, identity, 5, true);
  expect(getDecision(db, identity.tripId, identity.decisionId)).toMatchObject({
    revision: 6,
    selectedOptionId: option.id,
  });
  expect(getJourney(db, identity.tripId, journey.id)).toEqual(journey);
});
it('rejects foreign ownership and removed decisions without mutating selection or removed source', () => {
  const { db, identity } = fixture();
  const foreignTrip = createTrip(db, {}).id;
  const foreignDecision = createDecision(db, identity.tripId, {}).id;
  expect(() => restoreDecisionOption(db, { ...identity, tripId: foreignTrip }, 3, true)).toThrow(
    'not_found'
  );
  expect(() =>
    restoreDecisionOption(db, { ...identity, decisionId: foreignDecision }, 0, true)
  ).toThrow('not_found');
  expect(getDecision(db, identity.tripId, identity.decisionId)).toMatchObject({
    revision: 3,
    selectedOptionId: null,
  });
  deleteDecision(db, { tripId: identity.tripId, id: identity.decisionId }, 3);
  expect(() => restoreDecisionOption(db, identity, 3, true)).toThrow('not_found');
});
it('rejects a stale competing writer across database connections without undoing the winning selection', () => {
  const { db, identity, option } = fixture();
  const competing = openTripsDb(join(directory, 'trips.db'));
  try {
    const expectedRevision = getDecision(
      competing.db,
      identity.tripId,
      identity.decisionId
    ).revision;
    expect(listDecisionOptions(competing.db, identity.tripId, identity.decisionId)).toEqual([]);
    restoreDecisionOption(db, identity, expectedRevision, true);
    expect(() => restoreDecisionOption(competing.db, identity, expectedRevision, false)).toThrow(
      'decision_revision_conflict'
    );
    expect(getDecision(competing.db, identity.tripId, identity.decisionId)).toMatchObject({
      revision: 4,
      selectedOptionId: option.id,
    });
  } finally {
    competing.raw.close();
  }
});

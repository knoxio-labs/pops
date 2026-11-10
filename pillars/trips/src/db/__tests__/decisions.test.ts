import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DecisionInputSchema, DecisionOptionInputSchema } from '../../contract/decision-schemas.js';
import { openTripsDb, type OpenedTripsDb } from '../index.js';
import {
  getDecision,
  getDecisionOption,
  listDecisions,
  listDecisionOptions,
} from '../services/decision-queries.js';
import {
  createDecision,
  updateDecision,
  selectDecisionOption,
  deleteDecision,
  createDecisionOption,
  updateDecisionOption,
  deleteDecisionOption,
} from '../services/decisions.js';
import { createJourney, deleteJourney, getJourney } from '../services/journeys.js';
import { createTrip, createPlace, createVisit } from '../services/records.js';
import { createStay } from '../services/stays.js';

let opened: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'decisions-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const db = opened.db;
  const trip = createTrip(db, {});
  const decision = createDecision(db, trip.id, {});
  return { db, tripId: trip.id, id: decision.id };
}

describe('decision source contracts', () => {
  it('rejects invalid dates, inferred identities and duplicate references', () => {
    for (const deadline of ['2028-02-30', '2028-01-01T12:00:00Z', ''])
      expect(DecisionInputSchema.safeParse({ deadline }).success).toBe(false);
    expect(DecisionInputSchema.safeParse({ deadline: null }).success).toBe(true);
    expect(
      DecisionOptionInputSchema.safeParse({ affectedSources: [{ kind: 'event', id: 1 }] }).success
    ).toBe(false);
    expect(
      DecisionOptionInputSchema.safeParse({
        affectedSources: [
          { kind: 'stay', id: 1 },
          { kind: 'stay', id: 1 },
        ],
      }).success
    ).toBe(false);
  });
  it('persists unknown dates and unselected empty decisions across reopen', () => {
    const { db, tripId, id } = fixture();
    expect(getDecision(db, tripId, id)).toMatchObject({
      question: '',
      deadline: null,
      selectedOptionId: null,
      revision: 0,
    });
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    expect(listDecisions(opened.db, tripId)).toHaveLength(1);
    expect(listDecisionOptions(opened.db, tripId, id)).toEqual([]);
    expect(() => listDecisions(opened.db, tripId + 1)).toThrow('not_found');
  });
  it('preserves omitted values and clears nullable dates and replacement arrays', () => {
    const { db, tripId, id } = fixture();
    updateDecision(
      db,
      { tripId, id },
      { deadline: '2028-01-02', sourceLinks: [{ uri: 'https://example.com' }] },
      0
    );
    expect(updateDecision(db, { tripId, id }, { question: 'Choose?' }, 1)).toMatchObject({
      deadline: '2028-01-02',
      sourceLinks: [{ uri: 'https://example.com' }],
    });
    expect(
      updateDecision(db, { tripId, id }, { deadline: null, sourceLinks: [] }, 2)
    ).toMatchObject({ deadline: null, sourceLinks: [], revision: 3 });
    expect(() => updateDecision(db, { tripId: tripId + 1, id }, {}, 3)).toThrow('not_found');
  });
  it('validates every explicit source against the owning trip and rolls back the aggregate', () => {
    const { db, tripId, id } = fixture();
    const other = createTrip(db, {});
    const journey = createJourney(db, other.id, {});
    expect(() =>
      createDecisionOption(
        db,
        { tripId, id },
        { affectedSources: [{ kind: 'journey', id: journey.id }] },
        0
      )
    ).toThrow('not_found');
    expect(getDecision(db, tripId, id).revision).toBe(0);
    const place = createPlace(db, { name: 'Place' });
    const visit = createVisit(db, tripId, { placeId: place.id });
    const stay = createStay(db, tripId, {});
    const option = createDecisionOption(
      db,
      { tripId, id },
      {
        affectedSources: [
          { kind: 'visit', id: visit.id },
          { kind: 'stay', id: stay.id },
        ],
      },
      0
    );
    expect(option.affectedSources).toHaveLength(2);
    expect(() =>
      updateDecisionOption(
        db,
        { tripId, decisionId: id, id: option.id },
        { affectedSources: [{ kind: 'stay', id: stay.id + 1 }] },
        1
      )
    ).toThrow('not_found');
    expect(getDecision(db, tripId, id).revision).toBe(1);
  });
  it('retains deleted source identity and permits unrelated edits without revalidation', () => {
    const { db, tripId, id } = fixture();
    const journey = createJourney(db, tripId, {});
    const affectedSources = [{ kind: 'journey' as const, id: journey.id }];
    const option = createDecisionOption(db, { tripId, id }, { affectedSources }, 0);
    deleteJourney(db, tripId, journey.id);
    expect(
      updateDecisionOption(db, { tripId, decisionId: id, id: option.id }, { notes: 'Retained' }, 1)
        .affectedSources
    ).toEqual(affectedSources);
    expect(getDecision(db, tripId, id).revision).toBe(2);
    expect(
      updateDecisionOption(db, { tripId, decisionId: id, id: option.id }, { affectedSources }, 2)
        .affectedSources
    ).toEqual(affectedSources);
    expect(() =>
      updateDecisionOption(
        db,
        { tripId, decisionId: id, id: option.id },
        { affectedSources: [{ kind: 'journey', id: journey.id + 1 }] },
        3
      )
    ).toThrow('not_found');
  });
  it('rejects competing selections and stale child writes without rewriting sources', () => {
    const { db, tripId, id } = fixture();
    const journey = createJourney(db, tripId, { notes: 'Unchanged' });
    const first = createDecisionOption(
      db,
      { tripId, id },
      { affectedSources: [{ kind: 'journey', id: journey.id }] },
      0
    );
    const second = createDecisionOption(db, { tripId, id }, {}, 1);
    selectDecisionOption(db, { tripId, id }, first.id, 2);
    expect(() => selectDecisionOption(db, { tripId, id }, second.id, 2)).toThrow(
      'decision_revision_conflict'
    );
    expect(() => deleteDecisionOption(db, { tripId, decisionId: id, id: first.id }, 2)).toThrow(
      'decision_revision_conflict'
    );
    expect(getDecision(db, tripId, id).selectedOptionId).toBe(first.id);
    expect(getJourney(db, tripId, journey.id)).toEqual(journey);
    expect(selectDecisionOption(db, { tripId, id }, null, 3).selectedOptionId).toBeNull();
    const foreign = createDecision(db, tripId, {});
    const foreignOption = createDecisionOption(db, { tripId, id: foreign.id }, {}, 0);
    expect(() => selectDecisionOption(db, { tripId, id }, foreignOption.id, 4)).toThrow(
      'not_found'
    );
  });
  it('clears selected option on delete and removes only decision-owned records', () => {
    const { db, tripId, id } = fixture();
    const option = createDecisionOption(db, { tripId, id }, {}, 0);
    selectDecisionOption(db, { tripId, id }, option.id, 1);
    deleteDecisionOption(db, { tripId, decisionId: id, id: option.id }, 2);
    expect(getDecision(db, tripId, id)).toMatchObject({ selectedOptionId: null, revision: 3 });
    expect(() => getDecisionOption(db, tripId, id, option.id)).toThrow('not_found');
    createDecisionOption(db, { tripId, id }, {}, 3);
    expect(() => deleteDecision(db, { tripId, id }, 3)).toThrow('decision_revision_conflict');
    deleteDecision(db, { tripId, id }, 4);
    expect(listDecisions(db, tripId)).toEqual([]);
  });
});

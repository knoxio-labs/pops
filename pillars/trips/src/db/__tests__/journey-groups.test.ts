import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { journeys, journeyGroups, journeyGroupMembers } from '../schema.js';
import { getJourneyGroup, listJourneyGroups } from '../services/journey-group-queries.js';
import {
  addBlankJourneyAlternative,
  createJourneyGroup,
  deleteJourneyGroup,
  selectJourneyAlternative,
} from '../services/journey-groups.js';
import { createJourneyLeg, listJourneyLegs, updateJourneyLeg } from '../services/journey-legs.js';
import {
  createJourney,
  deleteJourney,
  getJourney,
  listJourneys,
  updateJourney,
} from '../services/journeys.js';
import {
  createPlace,
  createTrip,
  createVisit,
  listPlaces,
  listVisits,
} from '../services/records.js';

let opened: OpenedTripsDb;
let directory: string;
beforeEach(() => {
  const scratch = fileURLToPath(new URL('../../../../../tmp/', import.meta.url));
  mkdirSync(scratch, { recursive: true });
  directory = mkdtempSync(join(scratch, 'journey-groups-'));
  opened = openTripsDb(join(directory, 'trips.db'));
});
afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const db = opened.db;
  const trip = createTrip(db, {});
  const place = createPlace(db, { name: 'Shared source place' });
  const visit = createVisit(db, trip.id, { placeId: place.id });
  const current = createJourney(db, trip.id, {
    name: 'Purchased journey',
    reference: 'Original reference',
    notes: 'Original notes',
    buffers: { minimumConnectionMinutes: 137, airportBufferMinutes: 245 },
    sourceLinks: [{ uri: 'pops:documents/document/unavailable' }],
  });
  const originalLeg = createJourneyLeg(db, trip.id, current.id, {
    mode: 'Free source mode',
    from: { placeId: place.id, local: '2028-03-12T02:30', timeZone: 'America/Chicago' },
    to: {
      sourceLabel: 'Source destination',
      local: '2028-03-11T10:00',
      timeZone: 'UTC',
      sourceLinks: [{ uri: 'https://source.example' }],
    },
    intention: 'Alternative',
    arrangement: 'Agreed',
    purchase: 'Purchased',
    operator: 'Original operator',
    service: 'Original service',
    reference: 'Original leg reference',
    notes: 'Original leg notes',
    sourceLinks: [{ uri: 'pops:documents/document/42' }],
  });
  const alternative = createJourney(db, trip.id, {
    notes: 'Independent alternative',
    buffers: { airportBufferMinutes: 0 },
  });
  const alternativeLeg = createJourneyLeg(db, trip.id, alternative.id, {
    arrangement: 'Booked',
    from: { local: '2028-01-01T10:00' },
  });
  const unrelated = createJourney(db, trip.id, { notes: 'Unrelated option' });
  const group = createJourneyGroup(db, trip.id, {
    currentJourneyId: current.id,
    alternativeJourneyIds: [unrelated.id, alternative.id],
  });
  return {
    db,
    trip,
    place,
    visit,
    current,
    originalLeg,
    alternative,
    alternativeLeg,
    unrelated,
    group,
    identity: { tripId: trip.id, id: group.id },
  };
}

describe('Persisted journey alternatives', () => {
  it('creates explicit grouping, previews without selecting and preserves all source facts through selection and inverse selection', () => {
    const {
      db,
      trip,
      place,
      visit,
      current,
      originalLeg,
      alternative,
      alternativeLeg,
      unrelated,
      group,
      identity,
    } = fixture();
    expect(getJourneyGroup(db, trip.id, group.id)).toEqual(group);
    expect(getJourney(db, trip.id, alternative.id)).toEqual(alternative);
    expect(listJourneyGroups(db, trip.id)).toEqual([group]);
    const selected = selectJourneyAlternative(db, identity, {
      expectedRevision: group.revision,
      journeyId: alternative.id,
    });
    expect(selected).toMatchObject({
      currentJourneyId: alternative.id,
      alternativeJourneyIds: [unrelated.id, current.id],
      revision: 1,
    });
    expect(
      selectJourneyAlternative(db, identity, { expectedRevision: 1, journeyId: alternative.id })
    ).toEqual(selected);
    const restored = selectJourneyAlternative(db, identity, {
      expectedRevision: 1,
      journeyId: current.id,
    });
    expect(restored).toMatchObject({
      currentJourneyId: current.id,
      alternativeJourneyIds: group.alternativeJourneyIds,
      revision: 2,
    });
    expect(getJourney(db, trip.id, current.id)).toEqual(current);
    expect(getJourney(db, trip.id, alternative.id)).toEqual(alternative);
    expect(listJourneyLegs(db, trip.id, current.id)).toEqual([originalLeg]);
    expect(listJourneyLegs(db, trip.id, alternative.id)).toEqual([alternativeLeg]);
    expect(listPlaces(db)).toEqual([place]);
    expect(listVisits(db, trip.id)).toEqual([visit]);
  });

  it('creates blank independent alternatives from explicit buffers only and does not select catalogue references', () => {
    const { db, trip, current, group, identity } = fixture();
    const before = listJourneys(db, trip.id);
    const added = addBlankJourneyAlternative(db, identity, 0);
    expect(added.journey).toMatchObject({
      name: null,
      reference: null,
      notes: '',
      sourceLinks: [],
      buffers: current.buffers,
    });
    expect(listJourneyLegs(db, trip.id, added.journey.id)).toEqual([]);
    expect(added.group).toMatchObject({
      currentJourneyId: current.id,
      alternativeJourneyIds: [...group.alternativeJourneyIds, added.journey.id],
      revision: 1,
    });
    updateJourney(db, trip.id, added.journey.id, {
      notes: 'Only the option',
      buffers: { airportBufferMinutes: 11 },
    });
    expect(getJourney(db, trip.id, current.id)).toEqual(current);
    expect(listJourneys(db, trip.id).slice(0, before.length)).toEqual(before);
    const blankSource = createJourney(db, trip.id, {});
    const blankGroup = createJourneyGroup(db, trip.id, { currentJourneyId: blankSource.id });
    expect(
      addBlankJourneyAlternative(db, { tripId: trip.id, id: blankGroup.id }, 0).journey.buffers
    ).toEqual({});
  });

  it('allows shared source membership without sharing group selection or revision', () => {
    const { db, trip, current, originalLeg, alternative, group, identity } = fixture();
    const other = createJourneyGroup(db, trip.id, {
      currentJourneyId: alternative.id,
      alternativeJourneyIds: [current.id],
    });
    const updatedLeg = updateJourneyLeg(
      db,
      { tripId: trip.id, journeyId: current.id, id: originalLeg.id },
      { notes: 'Latest independent source' }
    );
    selectJourneyAlternative(db, identity, { expectedRevision: 0, journeyId: alternative.id });
    expect(getJourneyGroup(db, trip.id, other.id)).toEqual(other);
    expect(listJourneyLegs(db, trip.id, current.id)).toEqual([updatedLeg]);
    expect(getJourneyGroup(db, trip.id, group.id).revision).toBe(1);
  });

  it('rejects stale revisions from a second database handle without changing selection or creating orphan sources', () => {
    const { db, trip, alternative, group, identity } = fixture();
    const other = openTripsDb(join(directory, 'trips.db'));
    try {
      const stale = getJourneyGroup(other.db, trip.id, group.id);
      const selected = selectJourneyAlternative(db, identity, {
        expectedRevision: 0,
        journeyId: alternative.id,
      });
      const sources = listJourneys(db, trip.id);
      expect(() =>
        selectJourneyAlternative(other.db, identity, {
          expectedRevision: stale.revision,
          journeyId: alternative.id,
        })
      ).toThrow('revision_conflict');
      expect(() => addBlankJourneyAlternative(other.db, identity, stale.revision)).toThrow(
        'revision_conflict'
      );
      expect(() => deleteJourneyGroup(other.db, identity, stale.revision)).toThrow(
        'revision_conflict'
      );
      expect(getJourneyGroup(db, trip.id, group.id)).toEqual(selected);
      expect(listJourneys(db, trip.id)).toEqual(sources);
    } finally {
      other.raw.close();
    }
  });

  it('rejects unknown, nonmember and cross-trip sources without changing any group or source record', () => {
    const { db, trip, current, group, identity } = fixture();
    const otherTrip = createTrip(db, {});
    const foreign = createJourney(db, otherTrip.id, {});
    const ungrouped = createJourney(db, trip.id, {});
    const source = listJourneys(db, trip.id);
    for (const id of [99999, foreign.id, ungrouped.id])
      expect(() =>
        selectJourneyAlternative(db, identity, { expectedRevision: 0, journeyId: id })
      ).toThrow('not_found');
    expect(() => createJourneyGroup(db, trip.id, { currentJourneyId: foreign.id })).toThrow(
      'not_found'
    );
    expect(() =>
      createJourneyGroup(db, trip.id, {
        currentJourneyId: current.id,
        alternativeJourneyIds: [foreign.id],
      })
    ).toThrow('not_found');
    expect(() => getJourneyGroup(db, otherTrip.id, group.id)).toThrow('not_found');
    expect(() => addBlankJourneyAlternative(db, { tripId: otherTrip.id, id: group.id }, 0)).toThrow(
      'not_found'
    );
    expect(() =>
      selectJourneyAlternative(
        db,
        { tripId: otherTrip.id, id: group.id },
        { expectedRevision: 0, journeyId: current.id }
      )
    ).toThrow('not_found');
    expect(() => deleteJourneyGroup(db, { tripId: otherTrip.id, id: group.id }, 0)).toThrow(
      'not_found'
    );
    expect(() => listJourneyGroups(db, 99999)).toThrow('not_found');
    expect(getJourneyGroup(db, trip.id, group.id)).toEqual(group);
    expect(listJourneyGroups(db, otherTrip.id)).toEqual([]);
    expect(listJourneys(db, trip.id)).toEqual(source);
  });

  it('rolls back group creation after a member constraint failure and selection/addition inside an aborted transaction', () => {
    const { db, trip, current, group, alternative, identity } = fixture();
    const sources = listJourneys(db, trip.id);
    expect(() =>
      createJourneyGroup(db, trip.id, {
        currentJourneyId: current.id,
        alternativeJourneyIds: [current.id],
      })
    ).toThrow(/UNIQUE/u);
    expect(listJourneyGroups(db, trip.id)).toEqual([group]);
    expect(() =>
      db.transaction((tx) => {
        selectJourneyAlternative(tx, identity, { expectedRevision: 0, journeyId: alternative.id });
        addBlankJourneyAlternative(tx, identity, 1);
        throw new Error('Abort transaction');
      })
    ).toThrow('Abort transaction');
    expect(getJourneyGroup(db, trip.id, group.id)).toEqual(group);
    expect(listJourneys(db, trip.id)).toEqual(sources);
  });

  it('deletes grouping only, guards every shared source membership, and persists grouping across reopen', () => {
    const { db, trip, current, alternative, originalLeg, alternativeLeg, group, identity } =
      fixture();
    const other = createJourneyGroup(db, trip.id, {
      currentJourneyId: alternative.id,
      alternativeJourneyIds: [current.id],
    });
    opened.raw.close();
    opened = openTripsDb(join(directory, 'trips.db'));
    const reopened = opened.db;
    expect(getJourneyGroup(reopened, trip.id, group.id)).toEqual(group);
    for (const id of [current.id, alternative.id])
      expect(() => deleteJourney(reopened, trip.id, id)).toThrow('journey_grouped');
    deleteJourneyGroup(reopened, identity, 0);
    expect(() => getJourneyGroup(reopened, trip.id, group.id)).toThrow('not_found');
    expect(() => deleteJourney(reopened, trip.id, current.id)).toThrow('journey_grouped');
    deleteJourneyGroup(reopened, { tripId: trip.id, id: other.id }, 0);
    expect(getJourney(reopened, trip.id, current.id)).toEqual(current);
    expect(listJourneyLegs(reopened, trip.id, current.id)).toEqual([originalLeg]);
    expect(listJourneyLegs(reopened, trip.id, alternative.id)).toEqual([alternativeLeg]);
    deleteJourney(reopened, trip.id, current.id);
    expect(() => getJourney(reopened, trip.id, current.id)).toThrow('not_found');
  });

  it('enforces source and group foreign keys beneath the service layer', () => {
    const { db, trip, current, group } = fixture();
    expect(() =>
      db.insert(journeyGroups).values({ tripId: trip.id, currentJourneyId: 99999 }).run()
    ).toThrow(/FOREIGN KEY/u);
    expect(() =>
      db
        .insert(journeyGroupMembers)
        .values({ groupId: 99999, journeyId: current.id, position: 0 })
        .run()
    ).toThrow(/FOREIGN KEY/u);
    expect(() =>
      db
        .insert(journeyGroupMembers)
        .values({ groupId: group.id, journeyId: 99999, position: 9 })
        .run()
    ).toThrow(/FOREIGN KEY/u);
    expect(() => db.delete(journeys).run()).toThrow(/FOREIGN KEY/u);
  });
});

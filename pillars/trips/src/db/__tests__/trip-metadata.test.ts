import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTripsDb, type OpenedTripsDb } from '../index.js';
import { trips } from '../schema.js';
import {
  createPlace,
  createTrip,
  createVisit,
  getTrip,
  listVisits,
  updateTrip,
} from '../services/records.js';
import { isKnownSharedTag, replaceSharedTagIds } from '../services/trip-associations.js';

const tagId = 'ac8bc979-9995-4f78-a0dc-b8fa34c74fc9';
let opened: OpenedTripsDb;
beforeEach(() => {
  opened = openTripsDb(':memory:');
});
afterEach(() => opened.raw.close());

describe('Approved trip metadata source', () => {
  it('keeps optional fields unknown and preserves destination and When verbatim without route inference', () => {
    const trip = createTrip(opened.db, {});
    expect(trip).toMatchObject({
      name: null,
      destination: '',
      when: '',
      parentId: null,
      tagId: null,
    });
    const place = createPlace(opened.db, { name: 'Explicit route place' });
    const visit = createVisit(opened.db, trip.id, {
      placeId: place.id,
      timing: { arrival: '2030-04-01' },
    });
    const input = {
      destination: '  Across the coast\nMaybe inland  ',
      when: 'around summer, after graduation — July-ish',
      notes: 'source notes',
    };
    expect(updateTrip(opened.db, trip.id, input)).toMatchObject(input);
    expect(listVisits(opened.db, trip.id)).toEqual([visit]);
  });

  it('preserves omitted metadata and unrelated references while explicit empties/null clear only their fields', () => {
    const parent = createTrip(opened.db, {});
    replaceSharedTagIds(opened.db, [tagId]);
    const trip = createTrip(opened.db, {
      name: '  Name source  ',
      destination: 'Destination',
      when: 'Maybe next year',
      tagId,
      parentId: parent.id,
      sourceLinks: [{ uri: 'https://source.example/trip' }],
    });
    const patched = updateTrip(opened.db, trip.id, { notes: 'changed' });
    expect(patched).toMatchObject({ ...trip, notes: 'changed', updatedAt: expect.any(String) });
    const cleared = updateTrip(opened.db, trip.id, {
      destination: '',
      when: '',
      name: null,
      tagId: null,
      parentId: null,
    });
    expect(cleared).toMatchObject({
      name: null,
      destination: '',
      when: '',
      tagId: null,
      parentId: null,
      sourceLinks: trip.sourceLinks,
      notes: 'changed',
    });
  });

  it('rejects self, descendant and missing parents atomically and allows detaching/reparenting', () => {
    const db = opened.db;
    const root = createTrip(db, {});
    const child = createTrip(db, { parentId: root.id });
    const descendant = createTrip(db, { parentId: child.id });
    for (const parentId of [root.id, child.id, descendant.id, 99999]) {
      expect(() => updateTrip(db, root.id, { parentId, notes: 'must not persist' })).toThrow(
        'parent_invalid'
      );
      expect(getTrip(db, root.id)).toEqual(root);
    }
    expect(() => createTrip(db, { parentId: 99999 })).toThrow('parent_invalid');
    expect(updateTrip(db, child.id, { parentId: null }).parentId).toBeNull();
    expect(updateTrip(db, root.id, { parentId: descendant.id }).parentId).toBe(descendant.id);
  });

  it('rejects an already cyclic proposed ancestry without looping', () => {
    const db = opened.db;
    const a = createTrip(db, {});
    const b = createTrip(db, { parentId: a.id });
    opened.raw.prepare('UPDATE trips SET parent_id = ? WHERE id = ?').run(b.id, a.id);
    expect(() => createTrip(db, { parentId: a.id })).toThrow('parent_invalid');
  });

  it('requires explicit tags in the last complete cache without modifying cached references on refresh', () => {
    const db = opened.db;
    expect(() => createTrip(db, { tagId })).toThrow('tag_unknown');
    replaceSharedTagIds(db, [tagId, tagId]);
    const trip = createTrip(db, { tagId });
    expect(isKnownSharedTag(db, tagId)).toBe(true);
    replaceSharedTagIds(db, []);
    expect(isKnownSharedTag(db, tagId)).toBe(false);
    expect(getTrip(db, trip.id).tagId).toBe(tagId);
    expect(updateTrip(db, trip.id, { notes: 'independent' }).tagId).toBe(tagId);
    expect(updateTrip(db, trip.id, { tagId: null }).tagId).toBeNull();
  });

  it('rolls back an incomplete cache replacement', () => {
    replaceSharedTagIds(opened.db, [tagId]);
    opened.raw.exec(
      "CREATE TRIGGER reject_cache BEFORE INSERT ON shared_tag_ids BEGIN SELECT RAISE(ABORT, 'cache write failed'); END;"
    );
    expect(() => replaceSharedTagIds(opened.db, ['fe8a1d81-df61-44f0-bdf8-f7020bc30bd4'])).toThrow(
      'cache write failed'
    );
    expect(isKnownSharedTag(opened.db, tagId)).toBe(true);
    expect(opened.db.select().from(trips).all()).toEqual([]);
  });
});

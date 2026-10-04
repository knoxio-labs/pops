import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb } from '../../__tests__/helpers.js';
import { sharedTagCache } from '../../schema.js';
import { isKnownSharedTag, replaceSharedTagCache } from '../shared-tag-cache.js';

import type { OpenedPurchasesDb } from '../../index.js';
import type { SharedTagCacheValue } from '../shared-tag-cache.js';

const TAG_A = '00000000-0000-4000-8000-000000000001';
const TAG_B = '00000000-0000-4000-8000-000000000002';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

function tag(overrides: Partial<SharedTagCacheValue> = {}): SharedTagCacheValue {
  return {
    tagId: TAG_A,
    facet: 'trip',
    name: 'Japan trip',
    archived: false,
    mergedIntoId: null,
    ...overrides,
  };
}

function rows() {
  return opened.db
    .select()
    .from(sharedTagCache)
    .all()
    .toSorted((left, right) => left.tagId.localeCompare(right.tagId));
}

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(() => {
  cleanup();
});

describe('the shared tag cache', () => {
  it('replaces the whole vocabulary with one fetch timestamp', () => {
    const fetchedAt = '2026-10-03T00:00:00.000Z';

    expect(
      replaceSharedTagCache(opened.db, [tag(), tag({ tagId: TAG_B, name: 'Pottery' })], fetchedAt)
    ).toBe(2);
    expect(rows()).toEqual([
      {
        tagId: TAG_A,
        facet: 'trip',
        name: 'Japan trip',
        archived: false,
        mergedIntoId: null,
        fetchedAt,
      },
      {
        tagId: TAG_B,
        facet: 'trip',
        name: 'Pottery',
        archived: false,
        mergedIntoId: null,
        fetchedAt,
      },
    ]);
  });

  it('answers membership by id, retaining archived and merged entries as known ids', () => {
    replaceSharedTagCache(opened.db, [
      tag({ archived: true, mergedIntoId: TAG_B }),
      tag({ tagId: TAG_B }),
    ]);

    expect(isKnownSharedTag(opened.db, TAG_A)).toBe(true);
    expect(isKnownSharedTag(opened.db, TAG_B)).toBe(true);
    expect(isKnownSharedTag(opened.db, '00000000-0000-4000-8000-000000000099')).toBe(false);
  });

  it('rolls back the delete if a replacement violates the unique tag id', () => {
    replaceSharedTagCache(opened.db, [tag()]);
    const before = rows();

    expect(() => replaceSharedTagCache(opened.db, [tag(), tag()])).toThrow();
    expect(rows()).toEqual(before);
  });

  it('accepts an authoritative empty vocabulary and clears prior rows', () => {
    replaceSharedTagCache(opened.db, [tag()]);

    expect(replaceSharedTagCache(opened.db, [])).toBe(0);
    expect(rows()).toEqual([]);
  });
});
